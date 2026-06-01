# Módulo RFID — Documentación técnica

> **Responsable del módulo:** team-rfid (Moisés Falcón).
> **Rama de trabajo:** `dev` (backend) y `team-rfid` (frontend).
> **Stack:** Node + Express + Sequelize + MySQL + Socket.IO en el backend; React + Vite + Tailwind + socket.io-client en el frontend.

Este documento describe cómo funciona el módulo RFID de Vertiche SortFlow, qué archivos lo componen, qué endpoints y eventos expone, cómo correrlo en local y cómo conectarlo con un lector físico (ESP32).

---

## 1. Qué hace el módulo RFID

El módulo RFID es el **núcleo operativo del CEDIS**. Su trabajo:

1. **Registrar prepacks** (cajas-tag) con su EPC, SKU, color/talla, tienda destino, proveedor y palet/orden de compra.
2. **Recibir lecturas** de los sensores RFID físicos (ESP32 + módulo RFID) cuando un prepack pasa por cada etapa del CEDIS.
3. **Detectar automáticamente anomalías** en esas lecturas (bahía incorrecta, RSSI bajo, EPC desconocido, lectura duplicada, QA fallido).
4. **Actualizar el estado del prepack** (`Tag.etapa_actual`) avanzando por las etapas del flujo.
5. **Empujar todo en tiempo real** al supervisor vía Socket.IO para que la pantalla refleje lo que está pasando físicamente al instante.

El flujo físico es:

```
[Camión] → RECEPCION → QA → REGISTRO → SORTING → PACKING → AUDITORIA → SALIDA → [Tienda]
              ↑         ↑      ↑          ↑         ↑          ↑          ↑
           ESP32     ESP32   ESP32      ESP32     ESP32      ESP32      ESP32
```

Cada etapa = un sensor RFID (7 en total). Cada sensor manda un `POST /rfid/lectura` al backend.

---

## 2. Tablas que usa el módulo

El backend ya tenía las tablas definidas en `vertiche_db.sql`. Las que el módulo RFID **lee y escribe**:

| Tabla | Lee | Escribe | Quién posee la definición |
|---|---|---|---|
| `Tag` | ✓ | ✓ | Compartido — RFID añade reglas de avance de etapa |
| `EventoLectura` | ✓ | ✓ | RFID es el principal escritor |
| `Anomalia` | ✓ | ✓ | RFID detecta y crea automáticamente |
| `InspeccionQA` | ✓ | ✓ | Compartido con team-proveedores; RFID añade efectos colaterales |
| `Palet` | ✓ | — | Compartido con team-sorter |
| `OrdenCompra` | ✓ | — | Compartido con team-proveedores |
| `Tienda` | ✓ | — | Compartido |
| `Proveedor` | ✓ | — | Compartido con team-proveedores |

**Resumen para los demás equipos**: el módulo RFID **no toca** ninguna tabla que no sean `Tag`, `EventoLectura` o `Anomalia` con escritura. Las demás solo las lee.

---

## 3. Archivos del backend que pertenecen al módulo RFID

> **A los demás equipos: por favor no modifiquen estos archivos sin coordinar con team-rfid.** Cualquier cambio aquí puede romper el flujo en vivo o el contrato con el ESP32.

### Nuevos (creados por team-rfid)

| Archivo | Propósito |
|---|---|
| [src/controllers/RfidController.ts](../src/controllers/RfidController.ts) | Endpoint inteligente `POST /rfid/lectura` + `GET /rfid/health` |
| [src/realtime/socketIo.ts](../src/realtime/socketIo.ts) | Singleton Socket.IO para emitir eventos en vivo |
| [simulator/index.js](../simulator/index.js) | Simulador de lectores (sustituye al ESP32 para demo/dev) |
| [docs/RFID_MODULE.md](RFID_MODULE.md) | Este documento |
| [docs/rfid_lectura_contrato.md](rfid_lectura_contrato.md) | Contrato del endpoint `/rfid/lectura` para el equipo de hardware |
| [docs/vertiche_db.sql](vertiche_db.sql) | Dump de referencia del schema |
| [docs/seed_completo.sql](seed_completo.sql) | Datos mínimos para demo (3 proveedores, 10 tiendas, 4 OCs) |
| [docs/seed_minimo.sql](seed_minimo.sql) | Subset más pequeño (2 proveedores, 3 tiendas, 1 OC) |

### Modificados por team-rfid (revisar antes de cambiar)

| Archivo | Qué hizo team-rfid |
|---|---|
| [src/provider/Server.ts](../src/provider/Server.ts) | Refactor para usar `http.createServer` y montar Socket.IO |
| [src/controllers/TagController.ts](../src/controllers/TagController.ts) | Validación FK, unicidad EPC, búsqueda por SKU, include de Palet (necesario para FlujoCEDIS) |
| [src/controllers/AnomaliaController.ts](../src/controllers/AnomaliaController.ts) | Añadido `PATCH /Anomalia/:id/resolver` y filtro `?resuelto=false` |
| [src/controllers/InspeccionQAController.ts](../src/controllers/InspeccionQAController.ts) | Efectos colaterales al RECHAZADO: marca tag.qa_fallido + anomalía QA_FALLIDO + emit socket |
| [src/controllers/PaletController.ts](../src/controllers/PaletController.ts) | `listarPalets` ahora incluye OrdenCompra (para el dropdown del frontend) |
| [src/auth/cognito.ts](../src/auth/cognito.ts) | Lectura lazy de env vars (permite correr en dev sin Cognito) |
| [src/middleware/verifyToken.ts](../src/middleware/verifyToken.ts) | JWKS client lazy (mismo motivo) |
| [src/index.ts](../src/index.ts) | Registrado RfidController en la lista de controllers |

### Sin cambios — territorio de otros equipos

`OrdenCompra`, `Pedido`, `DetalleOrden`, `Caja`, `PrepackCaja`, `PaletEtapaLog`, `Proveedor`, `Tienda`, `Usuario`, `Auth` (controllers + models), `middleware/requireRole`, `config/`.

---

## 4. Endpoints REST del módulo RFID

### `GET /rfid/health`
Health check para el ESP32. Devuelve `{ ok: true, ts }`.

### `GET /rfid/kpi`
KPIs operativos del CEDIS calculados en vivo desde la BD. Lo consume la barra superior de FlujoCEDIS y puede consumirlo cualquier módulo (Dashboard también). Devuelve `tiempo_promedio_min`, `mejora_porcentaje` vs benchmark manual, palets activos/completados hoy, lecturas hoy, anomalías abiertas. Detalle completo en `API_GUIDE.md` 9.2.1.

### `POST /rfid/lectura`
**El endpoint principal del módulo.** Recibe del ESP32 cada vez que un sensor lee un EPC.

**Body:**
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

**Etapas válidas:** `RECEPCION`, `QA`, `REGISTRO`, `SORTING`, `PACKING`, `AUDITORIA`, `SALIDA`.

**Mapeo a `Tag.etapa_actual` y a la columna del Gantt:**
| Etapa lectura | Estado del prepack | Columna del Gantt |
|---|---|---|
| RECEPCION | REGISTRADO    | PRE-REG    |
| QA        | EN_QA         | QA         |
| REGISTRO  | APROBADO      | REGISTRO   |
| SORTING   | EN_SORTING    | SORTER     |
| PACKING   | EN_CAJA       | BAHIA      |
| AUDITORIA | EN_AUDITORIA  | AUDITORIA  |
| SALIDA    | ENVIADO       | ENVIO      |

**Reglas de avance:**
- No retrocede de etapa.
- Tags en `RECHAZADO` ya no avanzan.
- Lecturas duplicadas no avanzan el estado (solo se registran).

**Respuesta exitosa (200):**
```json
{
  "lectura": { "id": 123, "epc": "...", "etapa": "QA", ... },
  "anomalias": [],
  "tag": { "epc": "...", "etapa_actual": "EN_QA", "qa_fallido": false },
  "etapaAnterior": "REGISTRADO",
  "etapaNueva": "EN_QA"
}
```

Si el EPC no existe → 202 con anomalía `TAG_DESCONOCIDO`.
Si faltan campos → 400 con detalle.

### Detección automática de anomalías

| Tipo | Cuándo |
|---|---|
| `TAG_DESCONOCIDO` | EPC no existe en `Tag`. |
| `LECTURA_DUPLICADA` | Mismo EPC + lector en últimos 5s. |
| `BAHIA_INCORRECTA` | Etapa `PACKING`/`SORTING` y `bahia` no coincide con `tag.tienda.bahia_asignada`. |
| `RSSI_BAJO` | `rssi < -75 dBm`. |
| `QA_FALLIDO` | Llega `POST /InspeccionQA/crearInspeccion` con `resultado=RECHAZADO` (sucede en `InspeccionQAController`, no aquí). |

### Otros endpoints del módulo (los del front)

- `GET /Tag/listarTags?limit=N&order=campo:asc|desc` — incluye Tienda + Proveedor + Palet (con `orden_id`).
- `POST /Tag/crearTag` — valida FK, EPC único, devuelve 201 con el tag.
- `GET /Tag/buscarSku/:sku` — búsqueda por LIKE en SKU.
- `GET /Tag/:epc` — detalle + últimas 50 lecturas + anomalías pendientes.
- `GET /Anomalia/listarAnomalias?resuelto=false` — solo abiertas.
- `PATCH /Anomalia/:id/resolver` — marca resuelta.
- `GET /Palet/listarPalets` — incluye OrdenCompra (para dropdown de Vinculación).
- `POST /InspeccionQA/crearInspeccion` — con efectos si resultado=RECHAZADO.

---

## 5. Eventos Socket.IO

El backend emite estos eventos en el mismo puerto 8080. El frontend RFID se conecta con `socket.io-client` apuntando al `VITE_API_BASE_URL`.

| Evento | Payload | Cuándo |
|---|---|---|
| `lectura` | `{ id, epc, lector_id, bahia, etapa, timestamp, rssi, es_duplicado, tag }` | Cada lectura procesada. |
| `anomalia` | `{ id, epc, tipo_error, etapa, bahia, lector_id, timestamp, descripcion, resuelto: false }` | Cada anomalía nueva. |
| `tag` | `{ epc, etapa_actual, etapaAnterior?, qa_fallido? }` | Cuando un tag cambia de estado. |
| `uid-detectado` | `{ uid, lector_id, timestamp }` | Modo registro del ESP32. |
| `prepack-asignado` | `{ epc_anterior, epc_nuevo, tag }` | Al asignar EPC real a placeholder. |
| `proveedor-actualizado` | `{ id, stars, level, approval_rate, defect_rate, total_deliveries }` | Después de cada inspección QA — útil para team-proveedores. |

El frontend usa `services/socketClient.js` para suscribirse desde cada pantalla.

---

## 6. Frontend — pantallas del módulo

Todo vive en `apps/rfid/` del monorepo del frontend.

| Pantalla | Ruta | Qué hace |
|---|---|---|
| **Flujo CEDIS** | `/rfid` | Gantt con OCs activas, distribución por etapa, grid de bahías. Se actualiza por socket cada vez que hay actividad. |
| **Bitácora** | `/rfid/bitacora` | Stream en vivo de lecturas + panel de anomalías recientes (con botón ✕ para resolver). |
| **Trazabilidad** | `/rfid/trazabilidad` y `/rfid/trazabilidad/:epc` | Búsqueda por EPC o SKU. Timeline con 7 etapas marcadas según lecturas/anomalías. |
| **Registrar Tag** | `/rfid/vinculacion` | Formulario para dar de alta un prepack con su EPC, SKU, tienda, proveedor y palet. |

Datos cargados directo del backend (sin mocks). Polling de respaldo cada 30s + push de Socket.IO para el camino feliz.

---

## 7. Cómo correrlo en local

### Pre-requisitos
- Node.js 18+ (probado con 24.15.0).
- MySQL Server 8.0+ corriendo en localhost:3306.

### Setup inicial (una vez)

**1. Backend** (`Vertiche_Backend/`):
```bash
npm install
cp .env.example .env
# Edita .env con tu DB_PASSWORD real
```

**2. Crear la BD y sembrar datos:**
```bash
mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS VerticheSortFlow_DEV_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -uroot -p VerticheSortFlow_DEV_DB < docs/vertiche_db.sql
mysql -uroot -p < docs/seed_completo.sql
```

**3. Frontend** (`Vertiche_Frontend/`):
```bash
npm install
# Crear .env en la raíz con VITE_API_BASE_URL=http://localhost:8080
echo "VITE_API_BASE_URL=http://localhost:8080" > .env
```

### Arrancar todo

**Terminal 1 — Backend:**
```bash
cd Vertiche_Backend
npm run build && node -r dotenv/config dist/index.js
# o npm run build:start
```
Salida esperada: `Server running on http://localhost:8080` + `Socket.IO escuchando en el mismo puerto`.

**Terminal 2 — Frontend:**
```bash
cd Vertiche_Frontend
npm run dev
```
Abre `http://localhost:5173`. Cualquier email/password sirve (mockSignIn). Elige rol `SUPERVISOR` para entrar al módulo RFID.

**Terminal 3 (opcional) — Simulador de ESP32:**
```bash
cd Vertiche_Backend
node simulator/index.js --tags 20 --ciclo 1500
```
Parámetros:
- `--tags N` → cuántos EPCs simular (default 10).
- `--ciclo MS` → cada cuántos ms se emite una lectura (default 2000).
- `--base URL` → backend URL (default `http://localhost:8080`).
- `--palet PAL-XXX` → forzar todos los tags a un solo palet.

Detener: `Ctrl+C`. Reanudar más tarde reutiliza los tags ya creados.

---

## 8. Cómo conectar el lector RFID real (ESP32)

El ESP32 debe mandar HTTP POST a `/rfid/lectura` con el shape documentado.

Pseudocódigo Arduino:
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
  http.POST(body);
  http.end();
}
```

Convención sugerida para `lector_id`: `ESP32-<ETAPA>-<NUM>` (ej. `ESP32-PACK-03`).

Ver detalles en [docs/rfid_lectura_contrato.md](rfid_lectura_contrato.md).

---

## 8.1. Integración con el módulo Proveedores (recálculo automático)

Cuando llega un `POST /InspeccionQA/crearInspeccion` desde la UI de team-proveedores, el backend del módulo RFID hace 2 cosas:

1. **Si `resultado === 'RECHAZADO'`**: marca el Tag rechazado y crea una `Anomalia QA_FALLIDO` (lo que ya estaba).

2. **Siempre, sin importar el resultado** — `recalcularStatsProveedor`:
   - Cuenta todas las inspecciones de ese proveedor en BD.
   - `approval_rate = aprobadas / total * 100`
   - `defect_rate = rechazadas / total * 100`
   - Mapea a stars: ≥95%→5★, ≥85%→4★, ≥70%→3★, ≥50%→2★, resto 1★.
   - level: stars ≥4.5 ELITE, ≥3 MEDIA, resto BAJA.
   - Hace `UPDATE Proveedor` con los nuevos valores.
   - Emite `proveedor-actualizado` por Socket.IO.

**Para team-proveedores**: tu dashboard puede suscribirse al evento `proveedor-actualizado` para refrescar el rating del proveedor sin polling. El payload trae los campos ya calculados.

Si quieren cambiar la fórmula de stars/level, edita `InspeccionQAController.recalcularStatsProveedor` y avísale a team-rfid.

## 9. Pendientes conocidos (deuda técnica del módulo)

| Pendiente | Por qué no se hizo |
|---|---|
| Auth Cognito en rutas RFID | Dashboard y otros equipos no mandan token todavía; activar guards los rompería. |
| Reconexión de Socket.IO con backoff | Hoy reconecta a 1s fijo. Si el backend cae mucho rato, hay reintentos en exceso. |
| Tests automatizados | El módulo se valida manualmente con el simulator. |
| Color de productos como paleta cerrada en BD | Hoy `Tag.color` es string libre; el frontend normaliza a Title Case pero la BD aún acepta cualquier valor. |

---

## 10. Glosario rápido

- **EPC** — Electronic Product Code. Identificador único del chip RFID.
- **Tag / Prepack** — Una caja física tagueada con un chip RFID. Una unidad de transporte.
- **OC** — Orden de Compra. Un pedido al proveedor que llega como N prepacks.
- **Palet** — Grupo lógico de prepacks que comparten OC y se procesan juntos.
- **Bahía** — Zona física del CEDIS asignada a una tienda destino. Hay 10 (BAHIA-1 a BAHIA-10).
- **Etapa** — Una de las 7 fases del flujo: RECEPCION, QA, REGISTRO, SORTING, PACKING, AUDITORIA, SALIDA. Cada una tiene un lector RFID físico.
- **Anomalía** — Evento de error detectado automática o manualmente.
