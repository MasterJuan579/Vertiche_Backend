# Vertiche SortFlow — Backend

Backend REST API para el sistema **Vertiche SortFlow**, una plataforma de clasificación automatizada de prepacks (etiquetas RFID) en un centro de distribución. Gestiona el flujo completo desde la recepción de palets de proveedores hasta el despacho de cajas selladas hacia tiendas destino.

Desarrollado con **Node.js + TypeScript + Sequelize + MySQL** sobre **AWS RDS**, desplegado en **AWS EC2**.

---

## Tabla de contenido

1. [Tecnologías](#tecnologías)
2. [Arquitectura del proyecto](#arquitectura-del-proyecto)
3. [Base de datos](#base-de-datos)
4. [Requisitos previos](#requisitos-previos)
5. [Instalación y configuración](#instalación-y-configuración)
6. [Variables de entorno](#variables-de-entorno)
7. [Scripts disponibles](#scripts-disponibles)
8. [Endpoints disponibles](#endpoints-disponibles)
9. [Autenticación](#autenticación)
10. [Despliegue en EC2](#despliegue-en-ec2)
11. [Convenciones del código](#convenciones-del-código)
12. [Troubleshooting](#troubleshooting)

---

### Deployment & Branch Strategy

This backend uses a 3-branch CI/CD pipeline:

| Branch | Purpose | Auto-deploys to |
|---|---|---|
| `dev` | Day-to-day teammate commits | (local dev only, no auto-deploy) |
| `staging` | Integration / pre-prod testing | DEV EC2 — `http://52.4.219.206:8080` |
| `prod` | Production | PROD EC2 — `http://3.221.34.193:8080` |

### Workflow test

1. Pull latest dev: `git checkout dev && git pull`
2. Make your changes
3. Test locally: `npm install && npm run build && npm start`
4. Commit & push: `git add . && git commit -m "..." && git push origin dev`
5. When ready to integrate: open PR `dev → staging`
6. Merge → GitHub Actions auto-deploys to DEV EC2
7. Test on DEV EC2: `curl http://52.4.219.206:8080/`
8. When stable: open PR `staging → prod`
9. Get 1 approval + status checks pass → merge
10. GitHub Actions auto-deploys to PROD EC2

### Local development setup

1. Clone repo, checkout dev
2. `npm install`
3. Create `.env` (see `.env.example`)
4. Ask the team owner for the dev `.env` values (don't commit them)
5. `npm run build`
6. `npm start`
7. Test at `http://localhost:8080/`

### Environments

| | PROD | DEV (staging) |
|---|---|---|
| Branch | `prod` | `staging` |
| URL | `http://3.221.34.193:8080` | `http://52.4.219.206:8080` |
| Database | `VerticheSortFlow_DB` | `VerticheSortFlow_DEV_DB` |
| Cognito Pool | `us-east-1_xpzYpXlRS` (shared) | (same) |
| PM2 process | `vertiche-api` | `vertiche-api-staging` |


## Tecnologías

| Tecnología   | Versión    | Uso                                |
|--------------|------------|------------------------------------|
| Node.js      | v18+       | Runtime                            |
| TypeScript   | 6.x        | Lenguaje principal                 |
| Express      | 5.x        | Framework HTTP                     |
| Sequelize    | 6.37.x     | ORM para MySQL                     |
| mysql2       | 3.22.x     | Driver de MySQL para Sequelize     |
| MySQL        | 8.4.x      | Motor de BD (AWS RDS)              |
| AWS EC2      | —          | Servidor de aplicación             |
| AWS RDS      | —          | Servidor de MySQL                  |
| PM2          | —          | Process manager en producción      |
| dotenv       | 17.x       | Variables de entorno               |
| cors         | 2.8.x      | Middleware CORS                    |
| AWS Cognito  | —          | User pool / autenticación          |
| @aws-sdk/client-cognito-identity-provider | 3.x | SDK para AdminCreateUser / AdminDeleteUser |
| jsonwebtoken | 9.x        | Verificación de JWT (id_token)     |
| jwks-rsa     | 3.x        | Cache de claves públicas de Cognito JWKS |

---

## Arquitectura del proyecto

```
backend_vertiche/
├── src/
│   ├── index.ts                  # Entry point — registra middlewares y controllers
│   ├── config/
│   │   ├── index.ts              # Exporta PORT y NODE_ENV
│   │   └── config.ts             # Configuración de Sequelize por environment
│   ├── provider/
│   │   └── Server.ts             # Clase Server — inicializa Express y conecta MySQL
│   ├── auth/
│   │   └── cognito.ts            # Cliente AWS SDK Cognito + constantes (issuer, JWKS URL)
│   ├── middleware/
│   │   ├── verifyToken.ts        # Valida JWT id_token (firma JWKS + iss + aud + token_use)
│   │   └── requireRole.ts        # Factory de middleware para gating por rol (ADMIN, etc.)
│   ├── types/
│   │   └── express.d.ts          # Augmenta Express.Request con `user` (poblado por verifyToken)
│   ├── models/
│   │   ├── index.ts              # Loader dinámico de modelos + associations
│   │   ├── UsuarioModel.ts       # Perfil + rol (cognito_sub enlaza a Cognito)
│   │   ├── ProveedorModel.ts
│   │   ├── TiendaModel.ts
│   │   ├── OrdenCompraModel.ts
│   │   ├── DetalleOrdenModel.ts
│   │   ├── PedidoModel.ts
│   │   ├── PaletModel.ts
│   │   ├── PaletEtapaLogModel.ts
│   │   ├── TagModel.ts
│   │   ├── EventoLecturaModel.ts
│   │   ├── CajaModel.ts
│   │   ├── PrepackCajaModel.ts
│   │   ├── InspeccionQAModel.ts
│   │   └── AnomaliaModel.ts
│   └── controllers/
│       ├── AbstractController.ts
│       ├── AuthController.ts     # /Auth/me, /Auth/registrar, /Auth/listarUsuarios, DELETE /Auth/:id
│       ├── ProveedorController.ts
│       ├── TiendaController.ts
│       ├── OrdenCompraController.ts
│       ├── DetalleOrdenController.ts
│       ├── PedidoController.ts
│       ├── PaletController.ts
│       ├── PaletEtapaLogController.ts
│       ├── TagController.ts
│       ├── EventoLecturaController.ts
│       ├── CajaController.ts
│       ├── PrepackCajaController.ts
│       ├── InspeccionQAController.ts
│       └── AnomaliaController.ts
├── dist/                         # Output compilado de TS (git-ignored)
├── .env                          # Variables de entorno (git-ignored)
├── .env.example                  # Forma esperada de .env (sin secretos, sí versionado)
├── .gitignore
├── package.json
├── tsconfig.json
├── API_GUIDE.md                  # Documentación completa de endpoints
└── README.md
```

### Patrón de diseño

- **Server:** clase central que inicializa Express, registra middlewares y controllers, y conecta MySQL vía Sequelize. Expone `extraRoutes` opcional para inyectar rutas ad-hoc.
- **AbstractController:** clase base abstracta con `router` y `prefix`. Cada controller hereda e implementa `initRoutes()`.
- **Singleton en controllers:** cada controller expone `static get instance()` para garantizar una sola instancia por proceso.
- **Modelos Sequelize:** patrón `module.exports = (sequelize, DataTypes) => class XModel extends Model`. El `models/index.ts` los carga dinámicamente con `readdirSync` filtrando archivos `.js` compilados y ejecuta `associate(db)` en cada uno.
- **Autenticación:** Cognito es fuente de verdad para identidad; el rol vive en MySQL (tabla `Usuario`). `verifyToken` valida el id_token contra JWKS y popula `req.user`; `requireRole('ADMIN')` se encadena para endpoints admin-only. Solo `/Auth/*` aplica gating por ahora (ver [Autenticación](#autenticación)).

---

## Base de datos

**Motor:** MySQL 8.4 en AWS RDS  
**Nombre de BD:** `Vertiche_DB`  
**ORM:** Sequelize con `timestamps: true` y `freezeTableName: true`

### Entidades y relaciones

```
Proveedor ──< OrdenCompra ──< DetalleOrden
Proveedor ──< Pedido ──< Palet ──< PaletEtapaLog
Proveedor ──< Tag
Proveedor ──< Anomalia
Proveedor ──< InspeccionQA
OrdenCompra ──< Palet
Pedido ──< Tag
Palet ──< Tag
Tienda ──< Tag
Tienda ──< Caja ──< PrepackCaja
Tag ──< EventoLectura
Tag ──< PrepackCaja
Tag ──< Anomalia
Tag ──< InspeccionQA
```

### Enums del sistema

| Enum           | Valores                                                                              |
|----------------|--------------------------------------------------------------------------------------|
| EstadoTienda   | `ACTIVA`, `PAUSADA`, `CERRADA`                                                       |
| EstadoOrden    | `CREADA`, `ENVIADA`, `EN_TRANSITO`, `RECIBIDA`, `PARCIAL`, `CANCELADA`              |
| EstadoPedido   | `PROGRAMADO`, `EN_TRANSITO`, `LLEGADO`, `PROCESADO`, `INCOMPLETO`                   |
| EstadoPalet    | `ESPERANDO`, `EN_RECEPCION`, `EN_QA`, `EN_PACKING`, `COMPLETADO`, `CON_ERROR`       |
| TipoFlujo      | `CROSS_DOCK`, `ALMACENAJE`, `DEVOLUCION`                                             |
| EstadoPrepack  | `REGISTRADO`, `EN_QA`, `APROBADO`, `RECHAZADO`, `EN_CAJA`, `ENVIADO`               |
| EstadoCaja     | `ABIERTA`, `EN_LLENADO`, `SELLADA`, `ENVIADA`, `ANULADA`                            |
| EtapaRFID      | `RECEPCION`, `QA`, `SORTING`, `PACKING`, `SALIDA`                                   |
| ResultadoQA    | `APROBADO`, `RECHAZADO`, `RETRABAJO`, `PENDIENTE`                                    |
| TipoAnomalia   | `TAG_DESCONOCIDO`, `LECTURA_DUPLICADA`, `BAHIA_INCORRECTA`, `TIENDA_INCORRECTA`, `QA_FALLIDO`, `PALET_INCOMPLETO`, `RSSI_BAJO`, `FUERA_DE_SECUENCIA` |

---

## Requisitos previos

- **Node.js** v18 o superior — [descargar](https://nodejs.org)
- **npm** v9 o superior (viene con Node)
- Acceso al servidor **MySQL/RDS** con la BD `Vertiche_DB` creada
- Git

---

## Instalación y configuración

### 1. Clonar el repositorio

```bash
git clone https://github.com/A01749697/vertiche_backend-Tet.git
cd vertiche_backend-Tet
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Instalar `@types/node` (REQUERIDO)

El proyecto usa `tsconfig.json` con `"types": []` y `strict: true`. Sin los tipos de Node, código como `process.env`, `__filename`, `__dirname` y `path` no compila:

```bash
npm install --save-dev @types/node
```

Luego en `tsconfig.json` cambia:
```jsonc
"types": ["node"]
```

### 4. Crear el archivo `.env`

Ver sección [Variables de entorno](#variables-de-entorno).

### 5. Compilar TypeScript

```bash
npm run build
```

### 6. Iniciar el servidor

```bash
npm run start
```

O en un solo paso:

```bash
npm run build:start
```

El servidor levanta en `http://localhost:<PORT>`. La primera vez que arranca, Sequelize crea las tablas si no existen (`sync({ force: false })`).

---

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto con estas variables:

```env
PORT=8080
NODE_ENV=development

DB_NAME=Vertiche_DB
DB_USER=admin
DB_PASSWORD=<tu_password>
DB_HOST=<host-rds>.us-east-1.rds.amazonaws.com

# === Cognito (autenticación) ===
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=<26-char-client-id>

# === CORS ===
# Lista separada por comas de orígenes permitidos (sin slash final).
# En producción, agregar la URL de Vercel.
CORS_ORIGIN=http://localhost:5173
```

> **Importante:** `.env` está en `.gitignore` y nunca debe subirse al repositorio. Hay un `.env.example` con la forma esperada. Comparte las credenciales por canal seguro.

> **Credenciales AWS:** El backend NO necesita `AWS_ACCESS_KEY_ID` ni `AWS_SECRET_ACCESS_KEY` en `.env`. En EC2, el SDK toma credenciales del IAM role adjunto (`LabRole` en AWS Academy) vía Instance Metadata Service. En local, usa el perfil AWS configurado en `~/.aws/credentials`.

---

## Scripts disponibles

| Script        | Comando                | Descripción                                       |
|---------------|------------------------|---------------------------------------------------|
| Build         | `npm run build`        | Compila TypeScript a `/dist`                       |
| Start         | `npm run start`        | Ejecuta el servidor desde `/dist` con dotenv       |
| Build + Start | `npm run build:start`  | Compila y arranca en un solo comando               |

> No hay script de desarrollo con watch. Cada cambio en TS requiere recompilar con `npm run build:start`. Para hot reload se puede agregar `nodemon + ts-node` (ver [Troubleshooting](#troubleshooting)).

---

## Endpoints disponibles

Documentación completa con campos, enums, ejemplos de request/response y reglas de FKs: **[API_GUIDE.md](./API_GUIDE.md)**.

### Resumen rápido

Todos los recursos siguen el mismo patrón:

| Método | Ruta                          | Acción                  |
|--------|-------------------------------|-------------------------|
| GET    | `/<Recurso>/listar<Plural>`   | Listar todos            |
| GET    | `/<Recurso>/:id`              | Obtener uno por PK      |
| POST   | `/<Recurso>/crear<Singular>`  | Crear nuevo registro    |
| PUT    | `/<Recurso>/:id`              | Actualizar registro     |
| DELETE | `/<Recurso>/:id`              | Eliminar registro       |

### Recursos disponibles

| Recurso        | Prefijo URL       | PK             |
|----------------|-------------------|----------------|
| Proveedor      | `/Proveedor`      | `id` (number)  |
| Tienda         | `/Tienda`         | `tienda_id`    |
| OrdenCompra    | `/OrdenCompra`    | `orden_id`     |
| DetalleOrden   | `/DetalleOrden`   | `id` (number)  |
| Pedido         | `/Pedido`         | `pedido_id`    |
| Palet          | `/Palet`          | `palet_id`     |
| PaletEtapaLog  | `/PaletEtapaLog`  | `id` (number)  |
| Tag            | `/Tag`            | `epc`          |
| EventoLectura  | `/EventoLectura`  | `id` (number)  |
| Caja           | `/Caja`           | `caja_id`      |
| PrepackCaja    | `/PrepackCaja`    | `id` (number)  |
| InspeccionQA   | `/InspeccionQA`   | `id` (number)  |
| Anomalia       | `/Anomalia`       | `id` (number)  |

---

## Autenticación

El backend usa **AWS Cognito** como fuente de verdad para identidad. El **rol** del usuario vive en la tabla `Usuario` (MySQL), no en Cognito. Cognito guarda email + `sub` (UUID); el resto del perfil se busca en MySQL.

### Modelo de seguridad

- **Auto-registro deshabilitado.** Solo un `ADMIN` puede crear usuarios vía `POST /Auth/registrar`.
- **JWT verification solo en `/Auth/*`.** Los otros 13 controllers (Proveedor, Tienda, etc.) siguen abiertos por ahora — pendiente epic separado.
- **ID tokens duran 12 h** (config del pool). No hay refresh-token flow implementado todavía; el frontend renueva re-autenticando.

### Flujo

```
Frontend  ──login (email + password)──►  Cognito InitiateAuth
Cognito   ──{IdToken, AccessToken, RefreshToken}──►  Frontend
Frontend  ──Authorization: Bearer <IdToken>──►  Backend /Auth/*
Backend   ──verifyToken (JWKS + iss + aud + token_use)──►  req.user
Backend   ──requireRole(ADMIN) → lookup Usuario by cognito_sub──►  handler
```

### Endpoints de `/Auth`

| Método | Ruta                       | Quién                   | Descripción                              |
|--------|----------------------------|-------------------------|------------------------------------------|
| GET    | `/Auth/me`                 | Cualquier autenticado    | Perfil + rol del usuario actual          |
| POST   | `/Auth/registrar`          | ADMIN                   | Crea usuario (MySQL → Cognito)           |
| GET    | `/Auth/listarUsuarios`     | ADMIN                   | Lista todos los usuarios                 |
| DELETE | `/Auth/:id`                | ADMIN                   | Borra usuario (`:id` = `cognito_sub`)    |

### Roles

`ADMIN`, `OPS_MANAGER`, `SUPERVISOR`, `OPERATOR` — definidos como ENUM en `UsuarioModel`. Solo el rol ADMIN tiene acceso a `/Auth/registrar`, `/Auth/listarUsuarios` y `DELETE /Auth/:id`.

### `POST /Auth/registrar`

Body:
```json
{
  "email": "operator@example.com",
  "nombre": "Operador 1",
  "rol": "OPERATOR",
  "temporary_password": "optional"
}
```

- Si `temporary_password` no viene, el backend genera uno que cumple la política de Cognito y lo devuelve en la respuesta (única vez).
- **Atomicidad:** INSERT MySQL con `cognito_sub = '__PENDING__...'` placeholder → `AdminCreateUser` en Cognito → UPDATE MySQL con el `sub` real. Si Cognito falla, se borra la fila MySQL.

### Códigos de error de `/Auth/*`

| Status | Body `error`                                | Causa                                        |
|--------|---------------------------------------------|----------------------------------------------|
| 401    | `missing_token`                             | Header `Authorization` ausente               |
| 401    | `invalid_token`                             | JWT malformado, firma inválida o expirado    |
| 401    | `wrong_token_use`                           | Se envió access token en vez de id token     |
| 403    | `forbidden`                                 | Rol no autorizado                            |
| 403    | `usuario_inactivo`                          | `activo === false` en la fila Usuario        |
| 403    | `cannot_delete_self`                        | Intento de borrarse a uno mismo              |
| 404    | `usuario_no_registrado` / `usuario_no_encontrado` | JWT válido pero sin fila en MySQL      |
| 409    | `email_already_exists`                      | Email duplicado en MySQL                     |
| 500    | `cognito_create_failed` / `cognito_delete_failed` | Cognito rechazó la operación           |

### Bootstrap del primer ADMIN

El primer admin se crea **manualmente** en la consola de Cognito (con email marcado como verificado, status `FORCE_CHANGE_PASSWORD`), y luego se inserta a mano la fila correspondiente en MySQL:

```sql
INSERT INTO Usuario (cognito_sub, email, nombre, rol, activo, createdAt, updatedAt)
VALUES (
  '<sub-uuid-de-la-consola-cognito>',
  'admin@example.com',
  'Admin Principal',
  'ADMIN',
  true, NOW(), NOW()
);
```

Después de hacer login con la contraseña temporal, el frontend completará el challenge `NEW_PASSWORD_REQUIRED` (o se puede limpiar el estado con `aws cognito-idp admin-set-user-password --permanent` durante desarrollo).

---

## Despliegue en EC2

### Requisitos en la instancia

- Amazon Linux 2023
- Node.js v18+
- PM2 instalado globalmente

```bash
sudo dnf install -y nodejs
sudo npm install -g pm2
```

### Pasos de despliegue

```bash
# 1. Clonar el código
git clone https://github.com/A01749697/vertiche_backend-Tet.git
cd vertiche_backend-Tet

# 2. Configurar variables de entorno
nano .env

# 3. Instalar dependencias
npm install
npm install --save-dev @types/node

# 4. Compilar
npm run build

# 5. Iniciar con PM2 (cargando dotenv)
pm2 start dist/index.js --name vertiche-api --node-args="-r dotenv/config"

# 6. Inicio automático al reiniciar la EC2
pm2 startup   # copia y pega el comando que imprime
pm2 save
```

### Comandos PM2 del día a día

```bash
pm2 list                      # ver procesos activos
pm2 logs vertiche-api         # ver logs en vivo
pm2 restart vertiche-api      # reiniciar después de un deploy
pm2 stop vertiche-api         # detener
pm2 monit                     # monitor de CPU y RAM
```

### Flujo de actualización

```bash
git pull
npm install
npm run build
pm2 restart vertiche-api
```

### Verificar que el servidor responde

```bash
curl http://localhost:8080/
# Respuesta esperada: Server is working 🚀
```

---

## Convenciones del código

### Modelos Sequelize

- Archivo: `<Entidad>Model.ts` en PascalCase
- `modelName` sin sufijo `Model` (`'Proveedor'`)
- Enums exportados como `export enum` en el mismo archivo del modelo
- Asociaciones dentro de `static associate(models: any)`
- Patrón: `module.exports = (sequelize, DataTypes) => { ... }` para el loader dinámico

### Controllers

- Singleton con `private static _instance` y `public static get instance()`
- Heredan de `AbstractController` e implementan `protected initRoutes()`
- Métodos privados: `get<Acción>`, `post<Acción>`, `put<Acción>`, `delete<Acción>`
- `try/catch` con `res.status(500).json(err)` en el catch
- `findByPk` antes de update/delete; responde 404 si no existe

### Commits

```
feat: nueva funcionalidad
fix: corrección de bug
docs: cambios en documentación
refactor: refactor sin cambio funcional
chore: configuración o dependencias
```

---

## Troubleshooting

### `Cannot find name 'process'` o `'__dirname'` al compilar

Falta instalar `@types/node`:
```bash
npm install --save-dev @types/node
```

### `Cannot convert undefined or null to object` al iniciar

Algún modelo está intentando hacer `Object.values()` sobre un enum que no se exportó bien. `export enum` en archivos con `module.exports = ...` se rompe cuando se importan entre modelos. Cada modelo debe declarar localmente los enums que usa.

### `Unknown column 'createdAt'` en queries

`timestamps:true` en `models/index.ts` pero las tablas no tienen esas columnas. O recrear tablas, o cambiar a `timestamps:false`.

### El server muere al cerrar SSH en la EC2

Estás corriendo con `npm run start` directo. Usa PM2 (ver [Despliegue](#despliegue-en-ec2)).

### Cambios en código no se reflejan

Recompila con `npm run build` cada vez, o configura desarrollo con hot reload:

```bash
npm install --save-dev nodemon ts-node
```

Agregar a `package.json`:
```json
"dev": "nodemon --exec ts-node -r dotenv/config src/index.ts"
```

---

## Equipo

Proyecto académico — Tecnológico de Monterrey  
Materia: TC3005B  
Semestre: 2026

---

> Para la documentación completa de endpoints, campos, enums y consumo desde frontend o agentes IA: [API_GUIDE.md](./API_GUIDE.md).

