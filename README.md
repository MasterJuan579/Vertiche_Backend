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
9. [Despliegue en EC2](#despliegue-en-ec2)
10. [Convenciones del código](#convenciones-del-código)
11. [Troubleshooting](#troubleshooting)

---

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
│   ├── models/
│   │   ├── index.ts              # Loader dinámico de modelos + associations
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
├── .gitignore
├── package.json
├── tsconfig.json
├── API_GUIDE.md                  # Documentación completa de endpoints
└── README.md
```

### Patrón de diseño

- **Server:** clase central que inicializa Express, registra middlewares y controllers, y conecta MySQL vía Sequelize.
- **AbstractController:** clase base abstracta con `router` y `prefix`. Cada controller hereda e implementa `initRoutes()`.
- **Singleton en controllers:** cada controller expone `static get instance()` para garantizar una sola instancia por proceso.
- **Modelos Sequelize:** patrón `module.exports = (sequelize, DataTypes) => class XModel extends Model`. El `models/index.ts` los carga dinámicamente con `readdirSync` filtrando archivos `.js` compilados y ejecuta `associate(db)` en cada uno.

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
```

> **Importante:** `.env` está en `.gitignore` y nunca debe subirse al repositorio. Comparte las credenciales por canal seguro.

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