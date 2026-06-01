# API Vertiche SortFlow — Guía de Consumo

Esta guía documenta todos los endpoints del backend Vertiche. Está escrita para que cualquier desarrollador o agente de IA pueda construir requests válidos sin necesidad de leer el código fuente.

## 1. Información general

- **Base URL (desarrollo local):** `http://localhost:8080`
- **Base URL (producción EC2):** `http://<IP_PUBLICA_EC2>:8080`
- **Formato:** Todos los requests y responses usan JSON (`Content-Type: application/json`).
- **Auth:** No hay autenticación todavía. Todos los endpoints son públicos.
- **Encoding de fechas:** ISO 8601, ejemplo: `"2026-05-18T10:00:00"` o `"2026-05-18T10:00:00.000Z"`.
- **Booleanos:** `true` / `false` (NO uses `1` / `0`).

## 2. Convención de rutas

Todos los recursos siguen el mismo patrón. Si conoces el patrón, conoces todos los endpoints.

| Método | Ruta                          | Acción                                |
|--------|-------------------------------|---------------------------------------|
| GET    | `/<Recurso>/listar<Plural>`   | Lista todos los registros             |
| GET    | `/<Recurso>/:id`              | Busca un registro por su PK           |
| POST   | `/<Recurso>/crear<Singular>`  | Crea un nuevo registro                |
| PUT    | `/<Recurso>/:id`              | Actualiza un registro existente       |
| DELETE | `/<Recurso>/:id`              | Elimina un registro                   |

Los nombres de `listar` / `crear` por recurso están en la sección 5.

## 3. Códigos de respuesta

| Código | Significado                                                   |
|--------|---------------------------------------------------------------|
| 200    | Operación exitosa                                             |
| 404    | El registro buscado no existe (en GET/:id, PUT/:id, DELETE/:id) |
| 500    | Error de servidor / BD (FK inválida, campo faltante, etc.)    |

Body de respuesta exitosa en GET:
```json
[ { "campo1": "valor", "campo2": "valor" }, ... ]
```
o (para GET/:id) un solo objeto:
```json
{ "campo1": "valor", "campo2": "valor" }
```

Body de respuesta exitosa en POST/PUT/DELETE:
```json
{ "message": "Registro de X exitoso" }
```

Body de respuesta de error:
```json
{ "name": "SequelizeValidationError", "errors": [...] }
```
o
```json
{ "message": "X no encontrado" }
```

## 4. Reglas de creación de datos (IMPORTANTE)

### 4.1. Orden obligatorio de inserción

Por las relaciones FK, no puedes crear un Tag sin Proveedor, ni un Palet sin Pedido, etc. Sigue este orden:

1. **Proveedor** (sin dependencias)
2. **Tienda** (sin dependencias)
3. **OrdenCompra** (requiere Proveedor)
4. **Pedido** (requiere Proveedor)
5. **Palet** (requiere Pedido + OrdenCompra)
6. **Tag** (requiere Proveedor + Tienda + Palet + Pedido)
7. **DetalleOrden** (requiere OrdenCompra)
8. **Caja** (requiere Tienda)
9. **PaletEtapaLog** (requiere Palet)
10. **EventoLectura** (requiere Tag)
11. **PrepackCaja** (requiere Tag + Caja)
12. **InspeccionQA** (requiere Tag + Proveedor)
13. **Anomalia** (requiere Tag + Proveedor)

### 4.2. Campos con default automático

Los siguientes campos NO necesitan enviarse en el body, se autogeneran:

- `id` (PK autoincremental en tablas con id numérico)
- `createdAt`, `updatedAt` (timestamps de Sequelize)
- Cualquier campo con `defaultValue` documentado en la sección 5 (estados, fechas con `NOW`, booleanos con `false`/`true`)

Puedes enviarlos si quieres sobreescribir el default.

## 5. Catálogo de endpoints por recurso

A continuación cada recurso con: campos, tipos, si es obligatorio, defaults, y ejemplos de body.

---

### 5.1. Proveedor

**PK:** `id` (number, autoincremental)

| Campo       | Tipo      | Obligatorio | Default       | Notas                  |
|-------------|-----------|-------------|---------------|------------------------|
| id          | number    | NO (auto)   | autoincrement |                        |
| nombre      | string    | SÍ          |               |                        |
| codigo      | string    | SÍ          |               | Único                  |
| contacto    | string    | NO          |               |                        |
| email       | string    | NO          |               | Debe ser email válido  |
| creado_en   | datetime  | SÍ          | NOW           |                        |

**Endpoints:**
- `GET /Proveedor/listarProveedores`
- `GET /Proveedor/:id`
- `POST /Proveedor/crearProveedor`
- `PUT /Proveedor/:id`
- `DELETE /Proveedor/:id`

**POST body ejemplo:**
```json
{
  "nombre": "Levis Mexico",
  "codigo": "LEVI-MX",
  "contacto": "Ana Torres",
  "email": "ana@levis.mx"
}
```

---

### 5.2. Tienda

**PK:** `tienda_id` (string, lo defines tú)

| Campo           | Tipo      | Obligatorio | Default | Valores permitidos                       |
|-----------------|-----------|-------------|---------|------------------------------------------|
| tienda_id       | string    | SÍ          |         |                                          |
| nombre          | string    | SÍ          |         |                                          |
| ciudad          | string    | SÍ          |         |                                          |
| region          | string    | NO          |         |                                          |
| bahia_asignada  | string    | NO          |         |                                          |
| activa          | boolean   | NO          | true    |                                          |
| estado_rep      | enum      | NO          | ACTIVA  | `ACTIVA`, `PAUSADA`, `CERRADA`           |

**Endpoints:**
- `GET /Tienda/listarTiendas`
- `GET /Tienda/:id`  (el `:id` es `tienda_id`, ej. `/Tienda/TDA-CDMX-01`)
- `POST /Tienda/crearTienda`
- `PUT /Tienda/:id`
- `DELETE /Tienda/:id`

**POST body ejemplo:**
```json
{
  "tienda_id": "TDA-CDMX-01",
  "nombre": "Tienda Centro CDMX",
  "ciudad": "Ciudad de Mexico",
  "region": "Centro",
  "bahia_asignada": "B01"
}
```

---

### 5.3. OrdenCompra

**PK:** `orden_id` (string)

| Campo            | Tipo      | Obligatorio | Default | Notas / Valores                                                              |
|------------------|-----------|-------------|---------|------------------------------------------------------------------------------|
| orden_id         | string    | SÍ          |         |                                                                              |
| proveedor_id     | number    | SÍ          |         | FK a Proveedor.id                                                            |
| modelo           | string    | NO          |         |                                                                              |
| nombre_producto  | string    | SÍ          |         |                                                                              |
| estado           | enum      | NO          | CREADA  | `CREADA`, `ENVIADA`, `EN_TRANSITO`, `RECIBIDA`, `PARCIAL`, `CANCELADA`       |
| total_esperados  | number    | NO          | 0       |                                                                              |
| total_recibidos  | number    | NO          | 0       |                                                                              |
| fecha_creacion   | datetime  | SÍ          | NOW     |                                                                              |

**Endpoints:**
- `GET /OrdenCompra/listarOrdenes`
- `GET /OrdenCompra/:id`
- `POST /OrdenCompra/crearOrden`
- `PUT /OrdenCompra/:id`
- `DELETE /OrdenCompra/:id`

**POST body ejemplo:**
```json
{
  "orden_id": "OC-001",
  "proveedor_id": 1,
  "modelo": "501",
  "nombre_producto": "Jeans 501 Original",
  "total_esperados": 100
}
```

---

### 5.4. DetalleOrden

**PK:** `id` (number, autoincremental)

| Campo     | Tipo   | Obligatorio | Default       | Notas                |
|-----------|--------|-------------|---------------|----------------------|
| id        | number | NO (auto)   | autoincrement |                      |
| orden_id  | string | SÍ          |               | FK a OrdenCompra     |
| sku       | string | SÍ          |               |                      |
| talla     | string | NO          |               |                      |
| color     | string | NO          |               |                      |
| cantidad  | number | NO          | 0             |                      |

**Endpoints:**
- `GET /DetalleOrden/listarDetalles`
- `GET /DetalleOrden/:id`
- `POST /DetalleOrden/crearDetalle`
- `PUT /DetalleOrden/:id`
- `DELETE /DetalleOrden/:id`

**POST body ejemplo:**
```json
{
  "orden_id": "OC-001",
  "sku": "LEVI-501-32",
  "talla": "32",
  "color": "Azul",
  "cantidad": 50
}
```

---

### 5.5. Pedido

**PK:** `pedido_id` (string)

| Campo            | Tipo      | Obligatorio | Default     | Notas / Valores                                                       |
|------------------|-----------|-------------|-------------|-----------------------------------------------------------------------|
| pedido_id        | string    | SÍ          |             |                                                                       |
| proveedor_id     | number    | SÍ          |             | FK a Proveedor.id                                                     |
| estado           | enum      | NO          | PROGRAMADO  | `PROGRAMADO`, `EN_TRANSITO`, `LLEGADO`, `PROCESADO`, `INCOMPLETO`     |
| fecha_pedido     | datetime  | SÍ          | NOW         |                                                                       |
| fecha_llegada    | datetime  | NO          |             |                                                                       |
| total_esperados  | number    | NO          | 0           |                                                                       |
| total_recibidos  | number    | NO          | 0           |                                                                       |

**Endpoints:**
- `GET /Pedido/listarPedidos`
- `GET /Pedido/:id`
- `POST /Pedido/crearPedido`
- `PUT /Pedido/:id`
- `DELETE /Pedido/:id`

**POST body ejemplo:**
```json
{
  "pedido_id": "PED-001",
  "proveedor_id": 1,
  "total_esperados": 100
}
```

---

### 5.6. Palet

**PK:** `palet_id` (string)

| Campo              | Tipo      | Obligatorio | Default    | Notas / Valores                                                                |
|--------------------|-----------|-------------|------------|--------------------------------------------------------------------------------|
| palet_id           | string    | SÍ          |            |                                                                                |
| pedido_id          | string    | SÍ          |            | FK a Pedido                                                                    |
| orden_id           | string    | SÍ          |            | FK a OrdenCompra                                                               |
| estado             | enum      | NO          | ESPERANDO  | `ESPERANDO`, `EN_RECEPCION`, `EN_QA`, `EN_PACKING`, `COMPLETADO`, `CON_ERROR`  |
| total_prepacks     | number    | NO          | 0          |                                                                                |
| creado_en          | datetime  | SÍ          | NOW        |                                                                                |
| timestamp_llegada  | datetime  | NO          |            |                                                                                |
| timestamp_salida   | datetime  | NO          |            |                                                                                |
| tiempo_ciclo_min   | number    | NO          |            |                                                                                |

**Endpoints:**
- `GET /Palet/listarPalets`
- `GET /Palet/:id`
- `POST /Palet/crearPalet`
- `PUT /Palet/:id`
- `DELETE /Palet/:id`

**POST body ejemplo:**
```json
{
  "palet_id": "PAL-001",
  "pedido_id": "PED-001",
  "orden_id": "OC-001"
}
```

---

### 5.7. Tag (entidad central)

**PK:** `epc` (string)

| Campo            | Tipo      | Obligatorio | Default     | Notas / Valores                                                  |
|------------------|-----------|-------------|-------------|------------------------------------------------------------------|
| epc              | string    | SÍ          |             | Código RFID único del prepack                                    |
| sku              | string    | SÍ          |             |                                                                  |
| talla            | string    | NO          |             |                                                                  |
| color            | string    | NO          |             |                                                                  |
| cantidad_piezas  | number    | NO          | 1           |                                                                  |
| proveedor_id     | number    | SÍ          |             | FK a Proveedor.id                                                |
| tienda_id        | string    | SÍ          |             | FK a Tienda.tienda_id                                            |
| palet_id         | string    | NO          |             | FK a Palet.palet_id                                              |
| pedido_id        | string    | NO          |             | FK a Pedido.pedido_id                                            |
| tipo_flujo       | enum      | NO          | CROSS_DOCK  | `CROSS_DOCK`, `ALMACENAJE`, `DEVOLUCION`                         |
| etapa_actual     | enum      | NO          | REGISTRADO  | `REGISTRADO`, `EN_QA`, `APROBADO`, `RECHAZADO`, `EN_CAJA`, `ENVIADO` |
| qa_fallido       | boolean   | NO          | false       |                                                                  |
| registrado_en    | datetime  | SÍ          | NOW         |                                                                  |

**Endpoints:**
- `GET /Tag/listarTags`
- `GET /Tag/:id` (el `:id` es el `epc`)
- `POST /Tag/crearTag`
- `PUT /Tag/:id`
- `DELETE /Tag/:id`

**POST body ejemplo:**
```json
{
  "epc": "E2000017220C00701234ABCD",
  "sku": "LEVI-501-32",
  "talla": "32",
  "color": "Azul",
  "cantidad_piezas": 3,
  "proveedor_id": 1,
  "tienda_id": "TDA-CDMX-01",
  "palet_id": "PAL-001",
  "pedido_id": "PED-001"
}
```

---

### 5.8. PaletEtapaLog

**PK:** `id` (number, autoincremental)

| Campo              | Tipo      | Obligatorio | Default | Notas / Valores                                  |
|--------------------|-----------|-------------|---------|--------------------------------------------------|
| id                 | number    | NO (auto)   |         |                                                  |
| palet_id           | string    | SÍ          |         | FK a Palet                                       |
| etapa              | enum      | SÍ          |         | `RECEPCION`, `QA`, `SORTING`, `PACKING`, `SALIDA` |
| timestamp_entrada  | datetime  | SÍ          | NOW     |                                                  |
| timestamp_salida   | datetime  | NO          |         |                                                  |
| prepacks_entrada   | number    | NO          | 0       |                                                  |
| prepacks_salida    | number    | NO          | 0       |                                                  |
| tiene_anomalia     | boolean   | NO          | false   |                                                  |
| notas              | string    | NO          |         |                                                  |

**Endpoints:**
- `GET /PaletEtapaLog/listarLogs`
- `GET /PaletEtapaLog/:id`
- `POST /PaletEtapaLog/crearLog`
- `PUT /PaletEtapaLog/:id`
- `DELETE /PaletEtapaLog/:id`

**POST body ejemplo:**
```json
{
  "palet_id": "PAL-001",
  "etapa": "RECEPCION",
  "prepacks_entrada": 10
}
```

---

### 5.9. EventoLectura

**PK:** `id` (number, autoincremental)

| Campo         | Tipo      | Obligatorio | Default | Notas / Valores                                  |
|---------------|-----------|-------------|---------|--------------------------------------------------|
| id            | number    | NO (auto)   |         |                                                  |
| epc           | string    | SÍ          |         | FK a Tag.epc                                     |
| lector_id     | string    | SÍ          |         |                                                  |
| bahia         | string    | SÍ          |         |                                                  |
| timestamp     | datetime  | SÍ          | NOW     |                                                  |
| etapa         | enum      | SÍ          |         | `RECEPCION`, `QA`, `SORTING`, `PACKING`, `SALIDA` |
| rssi          | number    | NO          |         | Float                                            |
| antenna_port  | string    | NO          |         |                                                  |
| es_duplicado  | boolean   | NO          | false   |                                                  |

**Endpoints:**
- `GET /EventoLectura/listarLecturas`
- `GET /EventoLectura/:id`
- `POST /EventoLectura/crearLectura`
- `PUT /EventoLectura/:id`
- `DELETE /EventoLectura/:id`

**POST body ejemplo:**
```json
{
  "epc": "E2000017220C00701234ABCD",
  "lector_id": "LCT-RECEPCION-01",
  "bahia": "B01",
  "etapa": "RECEPCION",
  "rssi": -65.5,
  "antenna_port": "ANT1"
}
```

---

### 5.10. Caja

**PK:** `caja_id` (string)

| Campo               | Tipo      | Obligatorio | Default  | Notas / Valores                                       |
|---------------------|-----------|-------------|----------|-------------------------------------------------------|
| caja_id             | string    | SÍ          |          |                                                       |
| tienda_id           | string    | SÍ          |          | FK a Tienda                                           |
| bahia               | string    | SÍ          |          |                                                       |
| estado              | enum      | NO          | ABIERTA  | `ABIERTA`, `EN_LLENADO`, `SELLADA`, `ENVIADA`, `ANULADA` |
| timestamp_creacion  | datetime  | SÍ          | NOW      |                                                       |
| timestamp_sellado   | datetime  | NO          |          |                                                       |

**Endpoints:**
- `GET /Caja/listarCajas`
- `GET /Caja/:id`
- `POST /Caja/crearCaja`
- `PUT /Caja/:id`
- `DELETE /Caja/:id`

**POST body ejemplo:**
```json
{
  "caja_id": "CJA-001",
  "tienda_id": "TDA-CDMX-01",
  "bahia": "B01"
}
```

---

### 5.11. PrepackCaja

**PK:** `id` (number, autoincremental)

| Campo                  | Tipo      | Obligatorio | Default | Notas              |
|------------------------|-----------|-------------|---------|--------------------|
| id                     | number    | NO (auto)   |         |                    |
| epc                    | string    | SÍ          |         | FK a Tag.epc       |
| caja_id                | string    | SÍ          |         | FK a Caja          |
| timestamp_vinculacion  | datetime  | SÍ          | NOW     |                    |
| es_correcto            | boolean   | NO          | true    |                    |

**Endpoints:**
- `GET /PrepackCaja/listarVinculaciones`
- `GET /PrepackCaja/:id`
- `POST /PrepackCaja/crearVinculacion`
- `PUT /PrepackCaja/:id`
- `DELETE /PrepackCaja/:id`

**POST body ejemplo:**
```json
{
  "epc": "E2000017220C00701234ABCD",
  "caja_id": "CJA-001"
}
```

---

### 5.12. InspeccionQA

**PK:** `id` (number, autoincremental)

| Campo         | Tipo      | Obligatorio | Default    | Notas / Valores                                         |
|---------------|-----------|-------------|------------|---------------------------------------------------------|
| id            | number    | NO (auto)   |            |                                                         |
| tag_epc       | string    | SÍ          |            | FK a Tag.epc (atención: el campo se llama `tag_epc`)    |
| proveedor_id  | number    | SÍ          |            | FK a Proveedor.id                                       |
| operador_id   | string    | SÍ          |            |                                                         |
| resultado     | enum      | NO          | PENDIENTE  | `APROBADO`, `RECHAZADO`, `RETRABAJO`, `PENDIENTE`       |
| defecto_tipo  | string    | NO          |            |                                                         |
| observacion   | string    | NO          |            |                                                         |
| fecha         | datetime  | SÍ          | NOW        |                                                         |

**Endpoints:**
- `GET /InspeccionQA/listarInspecciones`
- `GET /InspeccionQA/:id`
- `POST /InspeccionQA/crearInspeccion`
- `PUT /InspeccionQA/:id`
- `DELETE /InspeccionQA/:id`

**POST body ejemplo:**
```json
{
  "tag_epc": "E2000017220C00701234ABCD",
  "proveedor_id": 1,
  "operador_id": "OP-001",
  "resultado": "APROBADO"
}
```

---

### 5.13. Anomalia

**PK:** `id` (number, autoincremental)

| Campo         | Tipo      | Obligatorio | Default | Notas / Valores                                                                                              |
|---------------|-----------|-------------|---------|--------------------------------------------------------------------------------------------------------------|
| id            | number    | NO (auto)   |         |                                                                                                              |
| epc           | string    | SÍ          |         | FK a Tag.epc                                                                                                 |
| tipo_error    | enum      | SÍ          |         | `TAG_DESCONOCIDO`, `LECTURA_DUPLICADA`, `BAHIA_INCORRECTA`, `TIENDA_INCORRECTA`, `QA_FALLIDO`, `PALET_INCOMPLETO`, `RSSI_BAJO`, `FUERA_DE_SECUENCIA` |
| lector_id     | string    | NO          |         |                                                                                                              |
| bahia         | string    | NO          |         |                                                                                                              |
| etapa         | enum      | SÍ          |         | `RECEPCION`, `QA`, `SORTING`, `PACKING`, `SALIDA`                                                            |
| timestamp     | datetime  | SÍ          | NOW     |                                                                                                              |
| proveedor_id  | number    | NO          |         | FK a Proveedor.id                                                                                            |
| resuelto      | boolean   | NO          | false   |                                                                                                              |
| descripcion   | string    | NO          |         |                                                                                                              |

**Endpoints:**
- `GET /Anomalia/listarAnomalias`
- `GET /Anomalia/:id`
- `POST /Anomalia/crearAnomalia`
- `PUT /Anomalia/:id`
- `DELETE /Anomalia/:id`

**POST body ejemplo:**
```json
{
  "epc": "E2000017220C00701234ABCD",
  "tipo_error": "RSSI_BAJO",
  "etapa": "RECEPCION",
  "descripcion": "Señal por debajo del umbral"
}
```

---

## 6. Ejemplos completos por método

### 6.1. GET (listar todos)

**Request:**
GET http://localhost:8080/Proveedor/listarProveedores

**Response 200:**
```json
[
  {
    "id": 1,
    "nombre": "Levis Mexico",
    "codigo": "LEVI-MX",
    "contacto": "Ana Torres",
    "email": "ana@levis.mx",
    "creado_en": "2026-05-18T10:00:00.000Z",
    "createdAt": "2026-05-18T10:00:01.000Z",
    "updatedAt": "2026-05-18T10:00:01.000Z"
  }
]
```

### 6.2. GET (uno por id)

**Request:**
GET http://localhost:8080/Proveedor/1

**Response 200:**
```json
{
  "id": 1,
  "nombre": "Levis Mexico",
  "codigo": "LEVI-MX",
  "contacto": "Ana Torres",
  "email": "ana@levis.mx",
  "creado_en": "2026-05-18T10:00:00.000Z",
  "createdAt": "2026-05-18T10:00:01.000Z",
  "updatedAt": "2026-05-18T10:00:01.000Z"
}
```

**Response 404:**
```json
{ "message": "Proveedor no encontrado" }
```

### 6.3. POST (crear)

**Request:**
POST http://localhost:8080/Proveedor/crearProveedor
Content-Type: application/json
{
"nombre": "Zara Mexico",
"codigo": "ZARA-MX",
"contacto": "Luis Pérez",
"email": "luis@zara.mx"
}

**Response 200:**
```json
{ "message": "Registro de proveedor exitoso" }
```

**Response 500 (FK inexistente o validación):**
```json
{
  "name": "SequelizeValidationError",
  "errors": [
    {
      "message": "Proveedor.codigo cannot be null",
      "path": "codigo"
    }
  ]
}
```

### 6.4. PUT (actualizar)

Solo envía los campos que quieres cambiar.

**Request:**
PUT http://localhost:8080/Anomalia/5
Content-Type: application/json
{ "resuelto": true }

**Response 200:**
```json
{ "message": "Anomalía actualizada exitosamente" }
```

### 6.5. DELETE (eliminar)

**Request:**
DELETE http://localhost:8080/Proveedor/3

**Response 200:**
```json
{ "message": "Proveedor eliminado exitosamente" }
```

**Atención:** Si intentas eliminar un registro referenciado por FKs activas, MySQL puede tirar error 500. Elimina primero los hijos.

## 7. Reglas para una IA que vaya a consumir esta API

Si eres un agente de IA generando código (React, fetch, axios) que consume esta API:

1. **Construye la URL** así: `BASE_URL + "/" + Recurso + "/" + acción_o_id`. Ejemplo: `http://localhost:8080/Tag/listarTags`.
2. **Verifica primero qué campos son obligatorios** en la sección 5 antes de armar el body. Si un campo dice "SÍ" en obligatorio y no tienes el valor, pídelo al usuario.
3. **Respeta los enums exactamente** (mayúsculas y guiones bajos). `"activa"` ≠ `"ACTIVA"`.
4. **No mandes campos con default a menos que quieras sobreescribirlos.**
5. **Antes de crear un registro con FK, verifica que el padre exista** haciendo un GET previo. Ejemplo: antes de crear un Tag con `proveedor_id: 5`, haz `GET /Proveedor/5`. Si responde 404, no crees el Tag.
6. **Para listar y luego buscar uno específico**, usa `/listar<Plural>` solo si necesitas todos. Si ya conoces el id, usa `/:id` directamente (es más rápido).
7. **Formato de fechas:** siempre ISO 8601 string, ej. `"2026-05-18T10:00:00.000Z"`. No mandes objetos Date de JS sin serializar.
8. **Headers:** siempre incluye `Content-Type: application/json` en POST y PUT.

### 7.1. Snippet de referencia (fetch)

```javascript
const BASE_URL = 'http://localhost:8080';

// LISTAR
async function listarTodos(recurso, accionListar) {
  const res = await fetch(`${BASE_URL}/${recurso}/${accionListar}`);
  return res.json();
}

// OBTENER UNO
async function obtenerPorId(recurso, id) {
  const res = await fetch(`${BASE_URL}/${recurso}/${id}`);
  if (res.status === 404) return null;
  return res.json();
}

// CREAR
async function crear(recurso, accionCrear, body) {
  const res = await fetch(`${BASE_URL}/${recurso}/${accionCrear}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

// ACTUALIZAR
async function actualizar(recurso, id, cambios) {
  const res = await fetch(`${BASE_URL}/${recurso}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cambios)
  });
  return res.json();
}

// ELIMINAR
async function eliminar(recurso, id) {
  const res = await fetch(`${BASE_URL}/${recurso}/${id}`, { method: 'DELETE' });
  return res.json();
}

// Ejemplos de uso:
await listarTodos('Proveedor', 'listarProveedores');
await obtenerPorId('Tag', 'E2000017220C00701234ABCD');
await crear('Tienda', 'crearTienda', { tienda_id: 'TDA-002', nombre: 'X', ciudad: 'CDMX' });
await actualizar('Anomalia', 5, { resuelto: true });
await eliminar('Caja', 'CJA-001');
```

## 8. Errores comunes y cómo evitarlos

| Síntoma                                                | Causa                                          | Solución                                          |
|--------------------------------------------------------|------------------------------------------------|---------------------------------------------------|
| `cannot be null` en error 500                          | Faltó un campo obligatorio en el body          | Revisa tabla del recurso en sección 5             |
| `ER_NO_REFERENCED_ROW_2` o `foreign key constraint`    | La FK apunta a un registro que no existe       | Crea primero el padre (ver orden sección 4.1)     |
| `Data truncated for column ... at row 1`               | Valor de enum mal escrito                      | Verifica enums exactos en sección 5               |
| 404 al hacer GET/:id                                   | El registro no existe                          | Lista primero para ver IDs válidos                |
| `ER_DUP_ENTRY`                                         | Intentaste crear con PK o campo único repetido | Usa otro valor o haz PUT para actualizar          |

---

## 9. Extensiones del módulo RFID

> **Mantenido por:** team-rfid (Moisés Falcón).
> Esta sección documenta endpoints, eventos Socket.IO y comportamientos añadidos por el módulo RFID. **No reemplaza** las secciones 1–8, las extiende. Los CRUD planos siguen funcionando exactamente como dicen las secciones 5.1 a 5.13.

### 9.1. Convenciones específicas del módulo RFID

- **Socket.IO** corre en el mismo puerto que la API REST (8080). El cliente se conecta con `io(BASE_URL)`.
- **Shape de error enriquecido** para todos los endpoints `/rfid/*` y para los endpoints CRUD que el módulo RFID endureció con validaciones (`/Tag/crearTag`, `/Anomalia/:id/resolver`):

  ```json
  { "error": "<código_máquina>", "message": "<mensaje_humano>", "detalle": "<info_extra>" }
  ```

  Códigos posibles: `campos_requeridos`, `fk_invalida`, `epc_duplicado`, `validacion`, `no_encontrado`, `etapa_invalida`, `placeholder_invalido`, `error_interno`.

- **Estados HTTP** que añade el módulo:
  - `201 Created` — al crear con éxito desde `/rfid/orden-compra` y `POST /Tag/crearTag`.
  - `202 Accepted` — cuando `POST /rfid/lectura` procesa una lectura de un EPC desconocido (igual la registra y crea anomalía).
  - `409 Conflict` — al crear un Tag con EPC duplicado o asignar un EPC ya usado.

---

### 9.2. `GET /rfid/health`

Health check del módulo. Útil para el ESP32 antes de empezar a enviar lecturas.

**Response 200:**
```json
{ "ok": true, "ts": "2026-05-31T18:30:00.000Z" }
```

---

### 9.2.1. `GET /rfid/kpi`

KPIs operativos del CEDIS calculados en vivo desde la BD. Lo consume la
barra superior de la pantalla FlujoCEDIS del módulo RFID, pero **cualquier
módulo puede usarlo** si necesita estos números (Dashboard, por ejemplo).

**Response 200:**
```json
{
  "tiempo_promedio_min": 345,
  "benchmark_manual_min": 480,
  "mejora_porcentaje": 28.1,
  "objetivo_mejora_pct": 32,
  "palets_activos": 7,
  "palets_completados_hoy": 3,
  "lecturas_hoy": 142,
  "anomalias_abiertas": 5,
  "calculado_en": "2026-06-01T03:15:00.000Z"
}
```

Campos:
- `tiempo_promedio_min`: promedio de `PaletEtapaLog.tiempo_ciclo_min` sobre
  palets `COMPLETADO`. `null` si no hay palets completados todavía.
- `benchmark_manual_min`: referencia teórica del proceso manual (480 min = 8h).
- `mejora_porcentaje`: `(benchmark - tiempo_promedio) / benchmark * 100`.
- `objetivo_mejora_pct`: meta del CEDIS (32%).
- `palets_activos`: palets en `ESPERANDO`/`EN_RECEPCION`/`EN_QA`/`EN_PACKING`.
- `palets_completados_hoy`: palets con `timestamp_salida >= 00:00 hoy`.
- `lecturas_hoy`: EventoLectura insertados hoy.
- `anomalias_abiertas`: Anomalia con `resuelto = false`.

---

### 9.3. `POST /rfid/lectura` (endpoint smart del ESP32 — etapa)

Recibe lecturas del lector físico cuando un prepack pasa por un sensor de etapa. Detecta anomalías automáticamente y actualiza `Tag.etapa_actual`.

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `epc` | string | SÍ | UID del chip RFID |
| `lector_id` | string | SÍ | Convención: `ESP32-<ETAPA>-<NUM>` |
| `etapa` | enum | SÍ | `RECEPCION`, `QA`, `SORTING`, `PACKING`, `SALIDA` |
| `bahia` | string | NO | Obligatorio si esperas validación de bahía |
| `rssi` | number | NO | dBm; si < `-75` genera anomalía `RSSI_BAJO` |
| `antenna_port` | string | NO | |

**Body ejemplo:**
```json
{
  "epc": "13:3F:D5:05",
  "lector_id": "ESP32-QA-01",
  "etapa": "QA",
  "bahia": "ZONA-QA",
  "rssi": -62.5,
  "antenna_port": "1"
}
```

**Response 200 (camino feliz):**
```json
{
  "lectura": { "id": 26, "epc": "13:3F:D5:05", "etapa": "QA", "timestamp": "...", "es_duplicado": false, "tag": { ... } },
  "anomalias": [],
  "tag": { "epc": "13:3F:D5:05", "etapa_actual": "EN_QA", "qa_fallido": false },
  "etapaAnterior": "REGISTRADO",
  "etapaNueva": "EN_QA"
}
```

**Response 202 (EPC desconocido):**
```json
{
  "message": "Lectura recibida pero el EPC no existe en el sistema. Anomalía registrada.",
  "anomalias": [{ "id": 17, "tipo_error": "TAG_DESCONOCIDO", ... }],
  "tag": null
}
```

**Detección automática de anomalías:**

| Tipo | Cuándo se dispara |
|---|---|
| `TAG_DESCONOCIDO` | El `epc` del request no existe en `Tag`. |
| `LECTURA_DUPLICADA` | Mismo `epc` + `lector_id` en los últimos 5 segundos. |
| `BAHIA_INCORRECTA` | `etapa` es `PACKING`/`SORTING` y `bahia` ≠ `tag.tienda.bahia_asignada`. |
| `RSSI_BAJO` | `rssi < -75`. |

**Mapeo de etapa a `Tag.etapa_actual`:**

| Etapa lectura | Estado del prepack resultante |
|---|---|
| `RECEPCION` | `REGISTRADO` |
| `QA` | `EN_QA` |
| `SORTING` | `APROBADO` |
| `PACKING` | `EN_CAJA` |
| `SALIDA` | `ENVIADO` |

Reglas: el estado **no retrocede**; tags `RECHAZADO` no avanzan; lecturas duplicadas no avanzan estado.

---

### 9.4. `POST /rfid/uid-detectado` (modo registro del ESP32)

Cuando el ESP32 (Lector 1 = modo registro) detecta un chip nuevo, envía solo el UID. El backend **no escribe en BD**, solo emite el evento Socket.IO `'uid-detectado'` para que el frontend (modal de Vinculación) autocomplete el campo EPC.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `uid` | string | SÍ |
| `lector_id` | string | NO |

**Body ejemplo:**
```json
{ "uid": "13:3F:D5:05", "lector_id": "ESP32-REGISTRO-01" }
```

**Response 200:**
```json
{ "ok": true, "uid": "13:3F:D5:05" }
```

---

### 9.5. `POST /rfid/orden-compra` (crear OC completa con desglose)

Crea en una sola transacción: `Pedido` + `OrdenCompra` + N `Palet` + M `DetalleOrden` + K `Tag` placeholder (uno por cada prepack esperado).

Cada Tag placeholder se crea con `epc = "PENDIENTE-<orden_id>-<n>"`, `etapa_actual = "REGISTRADO"` y todos los datos del renglón (sku, talla, color, piezas, tienda).

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `proveedor_id` | number | SÍ | FK Proveedor |
| `nombre_producto` | string | SÍ | |
| `modelo` | string | NO | |
| `numero_palets` | number | NO (default 1) | Máximo 20 |
| `detalles` | array | SÍ | Mínimo 1 renglón, cada uno con: |
| · `sku` | string | SÍ | |
| · `talla` | string | NO | |
| · `color` | string | NO | |
| · `piezas_por_prepack` | number | SÍ | |
| · `cantidad` | number | SÍ | # de prepacks de este tipo |
| · `tienda_id` | string | SÍ | FK Tienda |

**Body ejemplo:**
```json
{
  "proveedor_id": 1,
  "nombre_producto": "Playera básica algodón",
  "modelo": "PLY-V1",
  "numero_palets": 2,
  "detalles": [
    { "sku": "PLY-001", "talla": "M", "color": "Azul", "piezas_por_prepack": 12, "cantidad": 5, "tienda_id": "TDA-001" },
    { "sku": "PLY-001", "talla": "L", "color": "Azul", "piezas_por_prepack": 12, "cantidad": 3, "tienda_id": "TDA-002" }
  ]
}
```

**Response 201:**
```json
{
  "pedido": { "pedido_id": "PED-2026-123456", ... },
  "ordenCompra": { "orden_id": "OC-2026-123456", "total_esperados": 8, ... },
  "palets": [{ "palet_id": "PAL-123456-1" }, { "palet_id": "PAL-123456-2" }],
  "detalles": [...],
  "prepacks": [{ "epc": "PENDIENTE-OC-2026-123456-0001", ... }, ...],
  "total_prepacks": 8
}
```

---

### 9.6. `GET /rfid/orden/:orden_id/prepacks`

Lista los prepacks de una OC, separados por estado.

**Response 200:**
```json
{
  "orden_id": "OC-2026-123456",
  "total": 8,
  "pendientes_count": 5,
  "asignados_count": 3,
  "pendientes": [{ "epc": "PENDIENTE-OC-2026-123456-0001", "sku": "...", "Tienda": {...} }, ...],
  "asignados":  [{ "epc": "13:3F:D5:05", "sku": "...", "Tienda": {...} }, ...]
}
```

Un Tag se considera "pendiente" si su `epc` empieza con `PENDIENTE-`.

---

### 9.7. `POST /rfid/asignar-epc`

Reasigna el EPC de un Tag placeholder a un EPC real (el que se leyó con el ESP32).
Internamente hace `UPDATE Tag SET epc = epc_real WHERE epc = epc_placeholder`. Los FKs con `ON UPDATE CASCADE` propagan el cambio a `EventoLectura`, `Anomalia`, `PrepackCaja` e `InspeccionQA`.

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `epc_placeholder` | string | SÍ | Debe empezar con `PENDIENTE-` |
| `epc_real` | string | SÍ | No puede empezar con `PENDIENTE-` |

**Body ejemplo:**
```json
{ "epc_placeholder": "PENDIENTE-OC-2026-123456-0001", "epc_real": "13:3F:D5:05" }
```

**Response 200:**
```json
{ "message": "EPC asignado correctamente", "tag": { "epc": "13:3F:D5:05", ... } }
```

**Errores específicos:**
- `404 no_encontrado` — el placeholder no existe.
- `409 epc_duplicado` — el `epc_real` ya está en uso.
- `400 placeholder_invalido` — el `epc_placeholder` no empieza con `PENDIENTE-`.
- `400 epc_invalido` — el `epc_real` empieza con `PENDIENTE-` (no permitido).

Tras éxito emite Socket.IO `'prepack-asignado'`.

---

### 9.8. `PATCH /Anomalia/:id/resolver`

Atajo semántico para marcar una anomalía como resuelta. Equivalente a `PUT /Anomalia/:id` con `{ resuelto: true }`, pero más explícito.

**Response 200:**
```json
{ "message": "Anomalía resuelta", "anomalia": { "id": 17, "resuelto": true, ... } }
```

Errores: `404 no_encontrado`.

---

### 9.9. `GET /Tag/buscarSku/:sku`

Búsqueda de tags por SKU con `LIKE` (insensible a mayúsculas). Útil para Trazabilidad.

**Request:**
```
GET /Tag/buscarSku/PLY
```

**Response 200:** array de tags (mismo shape que `GET /Tag/listarTags`).

---

### 9.10. Endpoints CRUD endurecidos

El módulo RFID reforzó varios endpoints del catálogo de la sección 5 con validaciones extra. **Los contratos base no cambiaron**, solo se agregaron validaciones y campos enriquecidos en la respuesta.

#### `POST /Tag/crearTag`
- Valida que `epc`, `sku`, `proveedor_id` y `tienda_id` estén presentes.
- Verifica que `proveedor_id` y `tienda_id` existan antes de insertar (no espera a que MySQL tire FK error).
- Devuelve **201** con `{ message, tag: { ...con Proveedor, Tienda, Palet incluidos... } }`.
- En vez de `500 SequelizeUniqueConstraintError` devuelve `409 epc_duplicado` con mensaje claro.

#### `GET /Tag/listarTags`
- Query params opcionales:
  - `?limit=N` — limita el número de resultados.
  - `?order=campo:asc|desc` — ordena. Campos permitidos: `registrado_en`, `createdAt`, `updatedAt`, `epc`, `sku`.
- Cada tag incluye `Proveedor`, `Tienda` y `Palet` (con `orden_id`) anidados.

#### `GET /Tag/:id`
- Incluye `Proveedor`, `Tienda`, `Palet` y además:
  - `ultimas_lecturas`: últimas 50 lecturas de `EventoLectura`, orden desc por timestamp.
  - `anomalias_pendientes`: anomalías abiertas (resuelto=false).

#### `POST /InspeccionQA/crearInspeccion`
- Sin cambios en el body. Pero **si `resultado === "RECHAZADO"`** dispara efectos colaterales:
  - Setea `tag.qa_fallido = true`, `tag.etapa_actual = "RECHAZADO"`.
  - Crea automáticamente una `Anomalia` `QA_FALLIDO` ligada a ese tag.
  - Emite por Socket.IO los eventos `'tag'` y `'anomalia'`.
- Response incluye los efectos: `{ message, inspeccion, anomalia?, tagActualizado? }`.

#### `GET /Palet/listarPalets`
- Cada palet incluye `OrdenCompra` (orden_id, nombre_producto, estado) anidado para que el frontend pueda mostrar `"PAL-001 — Playera básica (OC-2026-001)"`.

---

### 9.11. Eventos Socket.IO

El cliente se conecta con `socket.io-client`:

```javascript
import { io } from 'socket.io-client';
const socket = io('http://localhost:8080'); // misma URL que la API REST

socket.on('lectura', (ev) => { ... });
socket.on('anomalia', (anom) => { ... });
socket.on('tag', (cambio) => { ... });
socket.on('uid-detectado', (data) => { ... });
socket.on('prepack-asignado', (data) => { ... });
```

| Evento | Cuándo lo emite el backend | Payload |
|---|---|---|
| `lectura` | Cada vez que `POST /rfid/lectura` procesa una (incluso duplicadas). | `{ id, epc, lector_id, bahia, etapa, timestamp, rssi, es_duplicado, tag: {...} }` |
| `anomalia` | Cada anomalía generada, sea automática (en `/rfid/lectura`) o por `POST /InspeccionQA/crearInspeccion` con RECHAZADO. | `{ id, epc, tipo_error, etapa, bahia, lector_id, timestamp, descripcion, resuelto: false, proveedor_id }` |
| `tag` | Cuando un Tag cambia de `etapa_actual` o pasa a `qa_fallido=true`. | `{ epc, etapa_actual, etapaAnterior?, qa_fallido? }` |
| `uid-detectado` | Cuando llega `POST /rfid/uid-detectado` (Lector 1 del ESP32 en modo registro). | `{ uid, lector_id, timestamp }` |
| `prepack-asignado` | Cuando `POST /rfid/asignar-epc` actualiza el EPC de un placeholder. | `{ epc_anterior, epc_nuevo, tag: {...} }` |
| `proveedor-actualizado` | Cuando `POST /InspeccionQA/crearInspeccion` termina y el backend recalcula stats del proveedor. **Para team-proveedores** — suscríbete para refrescar el rating sin polling. | `{ id, stars, level, approval_rate, defect_rate, total_deliveries }` |

#### Casos de uso para los otros equipos

- **Dashboard**: suscríbete a `lectura` y `anomalia` para gráficas en vivo sin necesidad de polling. Cada evento contiene el tag enriquecido para que no haya que pedir `GET /Tag/:id`. Considera `GET /rfid/kpi` para tu barra de métricas si quieres reutilizar el cálculo del CEDIS.
- **Sorter**: suscríbete a `tag` (etapa cambió) para refrescar la vista de bahía cuando un prepack avanza.
- **Proveedores**: dos eventos útiles —
  - `anomalia` filtrando por `proveedor_id` para alertar cuando llega un QA_FALLIDO de uno de los tuyos.
  - `proveedor-actualizado` para refrescar las estrellas/level/defect_rate del proveedor sin tener que hacer polling al endpoint de proveedores. El payload trae los campos ya recalculados.

---

### 9.12. Contrato resumido para el ESP32

El sketch Arduino debe usar **estos endpoints**:

| Lector físico | Endpoint | JSON que manda |
|---|---|---|
| Modo REGISTRO (Lector 1) | `POST /rfid/uid-detectado` | `{ "uid": "...", "lector_id": "ESP32-REGISTRO-01" }` |
| Modo LECTURA DE ETAPA (Lector 2…N) | `POST /rfid/lectura` | `{ "epc": "...", "lector_id": "ESP32-<ETAPA>-<NUM>", "etapa": "...", "bahia": "...", "rssi": -62 }` |

El endpoint viejo `POST /EventoLectura/crearLectura` (sección 5.9) **sigue funcionando** y crea filas planas en `EventoLectura`, pero **no** dispara la lógica smart (anomalías, avance de Tag, socket). Para el ESP32 nuevo usa siempre `/rfid/lectura`.