# Contrato `/rfid/lectura` para el ESP32

Endpoint pensado para que el lector RFID físico (ESP32 + módulo RFID) reporte cada vez que detecta un EPC.

## Base URL
`http://<HOST>:8080`

## `GET /rfid/health`
Útil para que el ESP32 valide conectividad antes de empezar a mandar lecturas.

**Respuesta 200:**
```json
{ "ok": true, "ts": "2026-05-28T17:21:44.000Z" }
```

## `POST /rfid/lectura`

### Request body
```json
{
  "epc": "RFID001",
  "lector_id": "ESP32-QA-01",
  "etapa": "QA",
  "bahia": "ZONA-QA",
  "rssi": -62.5,
  "antenna_port": "1"
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `epc` | string | sí | EPC leído del tag RFID. |
| `lector_id` | string | sí | Identificador del sensor/ESP32. Convención: `ESP32-<ETAPA>-<NUM>`. |
| `etapa` | string | sí | Una de `RECEPCION`, `QA`, `REGISTRO`, `SORTING`, `PACKING`, `AUDITORIA`, `SALIDA`. |
| `bahia` | string | no | Identificador de la bahía/zona física donde está el sensor (ej. `BAHIA-3`). Obligatorio si esperas validación de bahía. |
| `rssi` | number | no | Intensidad de señal en dBm. Si está y es menor a `-75`, se genera anomalía `RSSI_BAJO`. |
| `antenna_port` | string | no | Puerto de antena del lector. |

### Respuesta 200 (camino feliz)
```json
{
  "lectura": { "id": 123, "epc": "RFID001", "etapa": "QA", "timestamp": "...", "es_duplicado": false, "tag": { ... } },
  "anomalias": [],
  "tag": { "epc": "RFID001", "etapa_actual": "EN_QA", "qa_fallido": false, ... },
  "etapaAnterior": "REGISTRADO",
  "etapaNueva": "EN_QA"
}
```

### Respuesta 202 (EPC desconocido)
Si el EPC no existe en la tabla `Tag`, igual se procesa: se registra anomalía `TAG_DESCONOCIDO` y se devuelve 202. El ESP32 no debe reintentar; el supervisor verá la anomalía en Bitácora.
```json
{
  "message": "Lectura recibida pero el EPC no existe en el sistema. Anomalía registrada.",
  "anomalias": [{ "id": ..., "tipo_error": "TAG_DESCONOCIDO", ... }],
  "tag": null
}
```

### Errores
- `400 { error: "campos_requeridos", message, detalle: [...] }` — falta epc/lector_id/etapa.
- `400 { error: "etapa_invalida", message }` — etapa fuera del enum permitido.
- `500 { error: "error_interno", message }` — inesperado.

## Detección automática de anomalías

| Tipo | Cuándo se dispara |
|---|---|
| `TAG_DESCONOCIDO` | El EPC del request no existe en `Tag`. |
| `LECTURA_DUPLICADA` | Mismo `epc` + `lector_id` en los últimos 5 segundos. |
| `BAHIA_INCORRECTA` | `etapa` es `PACKING` o `SORTING`, `bahia` no coincide con `tag.tienda.bahia_asignada`. |
| `RSSI_BAJO` | `rssi` < `-75` dBm. |
| `QA_FALLIDO` | (no aquí — se dispara cuando llega `POST /InspeccionQA/crearInspeccion` con `resultado=RECHAZADO`). |

Todas las anomalías quedan con `resuelto: false`. El supervisor las resuelve desde el frontend (botón ✕ en Bitácora).

## Avance de etapa del Tag

El servidor mapea la etapa de la lectura al estado del prepack (`Tag.etapa_actual`):

| Etapa lectura | Tag.etapa_actual resultante |
|---|---|
| `RECEPCION` | `REGISTRADO` |
| `QA`        | `EN_QA` |
| `REGISTRO`  | `APROBADO` |
| `SORTING`   | `EN_SORTING` |
| `PACKING`   | `EN_CAJA` |
| `AUDITORIA` | `EN_AUDITORIA` |
| `SALIDA`    | `ENVIADO` |

Reglas:
- **No retrocede.** Si el tag ya está en `EN_CAJA` y llega lectura de `QA`, la lectura se registra pero el estado no baja.
- **Tags rechazados no avanzan.** Si `etapa_actual` es `RECHAZADO`, ninguna lectura lo mueve.
- **Lecturas duplicadas no avanzan.** Sólo se registran como histórico.

## Socket.IO

El backend emite estos eventos por Socket.IO en el mismo puerto (8080):

| Evento | Payload | Cuándo |
|---|---|---|
| `lectura` | `{ id, epc, lector_id, bahia, etapa, timestamp, rssi, es_duplicado, tag }` | Cada lectura procesada (incluso duplicados). |
| `anomalia` | `{ id, epc, tipo_error, etapa, bahia, lector_id, timestamp, descripcion, resuelto: false }` | Cada anomalía generada (manual o automática). |
| `tag` | `{ epc, etapa_actual, etapaAnterior?, qa_fallido? }` | Cuando un tag cambia de etapa o qa_fallido pasa a true. |

El frontend RFID se conecta con `socket.io-client` apuntando al mismo `VITE_API_BASE_URL`.

## Ejemplo curl

```bash
curl -X POST http://localhost:8080/rfid/lectura \
  -H "Content-Type: application/json" \
  -d '{
    "epc": "RFID001",
    "lector_id": "ESP32-QA-01",
    "etapa": "QA",
    "bahia": "ZONA-QA",
    "rssi": -62.5
  }'
```

## Ejemplo Arduino / ESP32 (pseudocódigo)

```cpp
#include <HTTPClient.h>
#include <ArduinoJson.h>

void enviarLectura(const String& epc, float rssi) {
  HTTPClient http;
  http.begin("http://<HOST>:8080/rfid/lectura");
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["epc"] = epc;
  doc["lector_id"] = "ESP32-QA-01";
  doc["etapa"] = "QA";
  doc["bahia"] = "ZONA-QA";
  doc["rssi"] = rssi;

  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  Serial.printf("POST /rfid/lectura → %d\n", code);
  http.end();
}
```
