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