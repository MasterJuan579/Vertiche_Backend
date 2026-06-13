/* ============================================================================
 *  Vertiche SortFlow — Cliente ESP32 para módulo RFID  (JWT-hardened)
 *  ──────────────────────────────────────────────────────────────────────────
 *  2 lectores MFRC522 con roles distintos:
 *    - Lector 1 (SS_PIN_1): modo REGISTRO. Cuando lee un chip, manda el UID
 *      al endpoint /rfid/uid-detectado. El backend lo emite por Socket.IO y
 *      la pantalla "Registrar Tag" del frontend autocompleta el campo EPC.
 *    - Lector 2 (SS_PIN_2): modo LECTURA DE ETAPA. Cuando lee un chip, manda
 *      al endpoint /rfid/lectura con la etapa configurada (QA, SORTING,
 *      PACKING o lo que sea). Eso dispara la lógica completa del backend:
 *      validación de EPC, detección de duplicados, anomalías y avance del
 *      Tag.etapa_actual.
 *
 *  CAMBIO POST-HARDENING (2026-06-05):
 *    - Todos los endpoints de negocio ahora requieren JWT vía Cognito.
 *    - El ESP32 autentica con USER_PASSWORD_AUTH al arrancar.
 *    - Guarda idToken en memoria y lo envía en header Authorization.
 *    - Si un POST devuelve 401, renueva el token y reintenta 1 vez.
 *    - pingBackend() usa GET /health (público) en lugar de /rfid/health.
 *    - Secretos (Wi-Fi, Cognito) viven en secrets.h (NO commitear).
 *
 *  Para cambiar el "rol" de cada lector, edita los #defines de abajo.
 *  ============================================================================ */

#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include "secrets.h"

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ CONFIGURACIÓN — edita estas constantes según tu setup                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// --- Identidad del ESP32 dentro del CEDIS ---
const char* LECTOR1_ID    = "ESP32-REGISTRO-01"; // físico de "registro"
const char* LECTOR2_ID    = "ESP32-PACKING-02";
const char* LECTOR2_ETAPA = "PACKING";
const char* LECTOR2_BAHIA = "ZONA-B-02";

// --- Pines (igual que tu .ino original) ---
#define SCK_PIN   19
#define MOSI_PIN  23
#define MISO_PIN  25
#define RST_PIN   -1
#define SS_PIN_1  22   // lector 1 — REGISTRO — único lector físico conectado a pin 22
#define SS_PIN_2  99   // lector 2 — ETAPA    — deshabilitado (pin inexistente)

// Evitar reenvíos del mismo chip si se queda apoyado en el lector
const unsigned long DEDUP_MS = 2500;

// Margen de seguridad antes de la expiración real del token (ms)
const unsigned long TOKEN_MARGIN_MS = 60 * 1000; // 1 minuto

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ Estado interno                                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const byte ssPins[] = { SS_PIN_1, SS_PIN_2 };
const int  numLectores = sizeof(ssPins) / sizeof(byte);
MFRC522 rfid[numLectores];

String  ultimoUID[numLectores]  = { "", "" };
unsigned long ultimoTS[numLectores] = { 0, 0 };

// ── JWT / Cognito ──────────────────────────────────────────────────────────
String        g_idToken       = "";
String        g_refreshToken  = "";
unsigned long g_tokenExpiresAt = 0;   // millis() en que expira

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ Setup                                                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║ Vertiche SortFlow — ESP32 RFID         ║");
  Serial.println("║ (JWT-hardened firmware)                ║");
  Serial.println("╚════════════════════════════════════════╝");
  Serial.printf("Lector 1 → REGISTRO  (id: %s)\n", LECTOR1_ID);
  Serial.printf("Lector 2 → %s        (id: %s)\n", LECTOR2_ETAPA, LECTOR2_ID);
  Serial.printf("Backend: %s\n\n", API_HOST);

  // Wi-Fi
  Serial.print("Conectando a Wi-Fi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[ERROR] No se pudo conectar al Wi-Fi en 20s. Reintentando indefinidamente...");
  } else {
    Serial.printf("\n[OK] Conectado. IP local: %s\n", WiFi.localIP().toString().c_str());
  }

  // SPI + lectores (pines > 39 no existen en ESP32 — se saltan)
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, ssPins[0]);
  for (int i = 0; i < numLectores; i++) {
    if (ssPins[i] > 39) {
      Serial.printf("Lector %d (SS=%d) deshabilitado.\n", i + 1, ssPins[i]);
      continue;
    }
    rfid[i].PCD_Init(ssPins[i], RST_PIN);
    delay(50);
    Serial.printf("Lector %d (SS=%d) listo.\n", i + 1, ssPins[i]);
  }

  // Verificar conectividad con el backend (público, sin token)
  pingBackend();

  // Autenticar con Cognito para obtener JWT
  if (authenticateCognito()) {
    Serial.println("[OK] Autenticación Cognito exitosa. Listo para enviar lecturas.");
  } else {
    Serial.println("[WARN] No se pudo autenticar con Cognito. Las lecturas fallarán con 401.");
  }

  Serial.println("\nAcerca un tag RFID al lector...");
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ Loop                                                                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

void loop() {
  for (int i = 0; i < numLectores; i++) {
    if (ssPins[i] > 39) continue;  // pin deshabilitado — skip
    rfid[i].PCD_Init(ssPins[i], RST_PIN);

    if (!rfid[i].PICC_IsNewCardPresent()) continue;
    if (!rfid[i].PICC_ReadCardSerial())  continue;

    String uid = leerUID(i);
    int rssi = WiFi.RSSI();

    // Dedupe local (el mismo chip apoyado no reenvía cada 200ms)
    unsigned long ahora = millis();
    if (uid == ultimoUID[i] && (ahora - ultimoTS[i]) < DEDUP_MS) {
      rfid[i].PICC_HaltA();
      rfid[i].PCD_StopCrypto1();
      continue;
    }
    ultimoUID[i] = uid;
    ultimoTS[i]  = ahora;

    Serial.printf("\n[Lector %d] UID detectado: %s (RSSI Wi-Fi: %d dBm)\n", i + 1, uid.c_str(), rssi);

    if (i == 0) {
      // Lector 1 → modo registro
      enviarUidDetectado(uid);
    } else {
      // Lector 2 → modo lectura de etapa
      enviarLecturaEtapa(uid, LECTOR2_ID, LECTOR2_ETAPA, LECTOR2_BAHIA, rssi);
    }

    rfid[i].PICC_HaltA();
    rfid[i].PCD_StopCrypto1();
  }

  delay(150);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ Helpers — RFID                                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

String leerUID(int idx) {
  String s = "";
  for (byte j = 0; j < rfid[idx].uid.size; j++) {
    if (rfid[idx].uid.uidByte[j] < 0x10) s += "0";
    s += String(rfid[idx].uid.uidByte[j], HEX);
    if (j < rfid[idx].uid.size - 1) s += ":";
  }
  s.toUpperCase();
  return s;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ Helpers — HTTP / Backend (público, sin auth)                             ║
// ╚══════════════════════════════════════════════════════════════════════════╝

void pingBackend() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(API_HOST) + "/health";
  http.begin(url);
  http.setTimeout(3000);
  int code = http.GET();
  if (code == 200) {
    Serial.println("[OK] Backend responde /health (healthy)");
  } else if (code == 503) {
    Serial.println("[OK] Backend responde /health (degraded — DB offline, pero API viva)");
  } else {
    Serial.printf("[WARN] /health devolvió %d\n", code);
  }
  http.end();
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ Helpers — Cognito Auth                                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/*
 * Extrae el valor de un campo string de un JSON plano.
 * Busca "fieldName":"value" y devuelve value.
 * NO es un parser JSON completo — suficiente para el response de Cognito.
 */
String extractJsonStringField(const String& json, const String& fieldName) {
  String key = "\"" + fieldName + "\":\"";
  int start = json.indexOf(key);
  if (start == -1) return "";
  start += key.length();
  int end = json.indexOf("\"", start);
  if (end == -1) return "";
  return json.substring(start, end);
}

/*
 * Extrae un campo numérico entero de un JSON plano.
 * Busca "fieldName":123 y devuelve 123 como String.
 */
String extractJsonNumberField(const String& json, const String& fieldName) {
  String key = "\"" + fieldName + "\":";
  int start = json.indexOf(key);
  if (start == -1) return "";
  start += key.length();
  // Saltar espacios en blanco
  while (start < json.length() && json.charAt(start) == ' ') start++;
  int end = start;
  while (end < json.length() && (json.charAt(end) >= '0' && json.charAt(end) <= '9')) end++;
  if (end == start) return "";
  return json.substring(start, end);
}

/*
 * Autentica con AWS Cognito vía USER_PASSWORD_AUTH.
 * Guarda idToken, refreshToken y tiempo de expiración en variables globales.
 * Devuelve true si obtuvo un IdToken válido.
 */
bool authenticateCognito() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[AUTH] Sin Wi-Fi, no se puede autenticar.");
    return false;
  }

  WiFiClientSecure secureClient;
  secureClient.setInsecure(); // AWS Cognito usa certificados válidos; sin SPIFFS basta

  HTTPClient http;
  String url = "https://cognito-idp." + String(COGNITO_REGION) + ".amazonaws.com/";
  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/x-amz-json-1.1");
  http.addHeader("X-Amz-Target", "AWSCognitoIdentityProviderService.InitiateAuth");
  http.setTimeout(8000);

  String body = "{";
  body += "\"AuthFlow\":\"USER_PASSWORD_AUTH\",";
  body += "\"ClientId\":\"" + String(COGNITO_CLIENT_ID) + "\",";
  body += "\"AuthParameters\":{";
  body += "\"USERNAME\":\"" + String(COGNITO_USERNAME) + "\",";
  body += "\"PASSWORD\":\"" + String(COGNITO_PASSWORD) + "\"";
  body += "}}";

  Serial.println("[AUTH] Solicitando token a Cognito...");
  int code = http.POST(body);
  String response = http.getString();
  http.end();

  if (code != 200) {
    Serial.printf("[AUTH] Error HTTP %d: %s\n", code, response.c_str());
    return false;
  }

  g_idToken      = extractJsonStringField(response, "IdToken");
  g_refreshToken = extractJsonStringField(response, "RefreshToken");

  String expiresStr = extractJsonNumberField(response, "ExpiresIn");
  int expiresIn = expiresStr.toInt();
  if (expiresIn <= 0) expiresIn = 3600; // fallback 1h

  g_tokenExpiresAt = millis() + ((expiresIn - 60) * 1000UL); // 60s de margen

  if (g_idToken.isEmpty()) {
    Serial.println("[AUTH] No se obtuvo IdToken del response.");
    return false;
  }

  Serial.printf("[AUTH] OK — token obtenido, válido por ~%d segundos.\n", expiresIn);
  return true;
}

/*
 * Verifica que haya un token vigente. Si no, intenta autenticar.
 */
bool ensureAuthenticated() {
  if (g_idToken.isEmpty() || (millis() > g_tokenExpiresAt)) {
    Serial.println("[AUTH] Token ausente o expirado, renovando...");
    return authenticateCognito();
  }
  return true;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ Helpers — Envío con auth + reintento 401                                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/*
 * Envía un POST al backend con Bearer token.
 * Si devuelve 401, renueva el token y reintenta UNA sola vez.
 * Devuelve true si la respuesta fue 2xx.
 */
bool enviarPostAuth(const String& endpoint, const String& jsonBody, const String& logLabel) {
  if (!ensureAuthenticated()) {
    Serial.println("[ERROR] No se pudo autenticar, abortando envío.");
    return false;
  }

  bool exito = false;
  for (int intento = 0; intento <= 1; intento++) {
    if (intento > 0) {
      Serial.println("[AUTH] Token rechazado, renovando y reintentando...");
      g_idToken = "";
      if (!authenticateCognito()) break;
    }

    HTTPClient http;
    String url = String(API_HOST) + endpoint;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + g_idToken);
    http.setTimeout(4000);

    Serial.print("  POST " + endpoint + " → ");
    Serial.println(jsonBody);

    int code = http.POST(jsonBody);
    String response = http.getString();
    http.end();

    Serial.printf("  → HTTP %d  %s\n", code, response.c_str());

    if (code >= 200 && code < 300) {
      exito = true;
      break;
    }

    if (code == 401) {
      // Token inválido o expirado en el servidor — reintentar una vez
      continue;
    }

    // Otro error (400, 404, 500, etc.) — no reintentar
    break;
  }

  return exito;
}

// Modo REGISTRO — el backend solo emite por socket; no actualiza nada en BD.
void enviarUidDetectado(const String& uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ERROR] Wi-Fi caído, no se envió.");
    return;
  }

  String body = "{\"uid\":\"" + uid + "\",\"lector_id\":\"" + String(LECTOR1_ID) + "\"}";
  enviarPostAuth("/rfid/uid-detectado", body, "uid-detectado");
}

// Modo LECTURA DE ETAPA — endpoint smart del backend.
void enviarLecturaEtapa(const String& uid, const char* lectorId, const char* etapa, const char* bahia, int rssi) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ERROR] Wi-Fi caído, no se envió.");
    return;
  }

  String body = "{";
  body += "\"epc\":\""        + uid + "\",";
  body += "\"lector_id\":\""  + String(lectorId) + "\",";
  body += "\"etapa\":\""      + String(etapa)    + "\",";
  body += "\"bahia\":\""      + String(bahia)    + "\",";
  body += "\"rssi\":"         + String(rssi);
  body += "}";

  enviarPostAuth("/rfid/lectura", body, "lectura");
}
