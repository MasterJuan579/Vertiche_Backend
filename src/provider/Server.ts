/* ============================================================================
 * Server.ts
 * ──────────────────────────────────────────────────────────────────────────
 *  REFACTOR del MÓDULO RFID.
 *  Cambio añadido por team-rfid:
 *    - Antes: app.listen(port). Ahora: http.createServer(app).listen(port)
 *      para poder montar Socket.IO en el mismo puerto.
 *    - initSocketIo(httpServer) se llama dentro de init().
 *  Si tu equipo necesita acceso al http server, está expuesto como propiedad.
 *  Ver docs/RFID_MODULE.md sección "Eventos Socket.IO".
 * ============================================================================ */
import express, { Request, Response } from 'express';
import { createServer, Server as HttpServer } from 'http';
import AbstractController from '../controllers/AbstractController';
import db from '../models';
import { initSocketIo } from '../realtime/socketIo';

class Server {
    //Atributos de instancia
    private app: express.Application;
    private httpServer: HttpServer;
    private port: number;
    private env: string;

    //Método constructor
    constructor(appInit: {
        port: number;
        env: string;
        middlewares: any[];
        controllers: AbstractController[];
        extraRoutes?: (app: express.Application) => void;
    }) {
        this.app = express();
        this.httpServer = createServer(this.app);
        this.port = appInit.port;
        this.env = appInit.env;
        this.initMiddlewares(appInit.middlewares);
        this.initControllers(appInit.controllers);
        if (appInit.extraRoutes) {
            appInit.extraRoutes(this.app);
        }
        this.connectDB();
    }

    private initMiddlewares(middlewares: any[]): void {
        middlewares.forEach(middleware => {
            this.app.use(middleware);
        });
    }
    private initControllers(controllers: AbstractController[]): void {
        //   http://IP:PORT/
        this.app.get('/', (_req: Request, res: Response) => {
            res.send('Server is working 🚀');
        });
        controllers.forEach(controller => {
            this.app.use("/" + controller.prefix, controller.router);
        });
    }
    private async connectDB() {
        try {
            await db.sequelize.sync({ force: false });
        } catch (err) {
            console.log(err);
        }
    }

    public init(): void {
        initSocketIo(this.httpServer);
        this.httpServer.listen(this.port, () => {
            console.log(`Server running on http://localhost:${this.port}`);
            console.log(`Socket.IO escuchando en el mismo puerto (${this.port})`);
        });
    }
}

export default Server;
