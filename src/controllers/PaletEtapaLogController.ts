/* ============================================================================
 * Archivo: PaletEtapaLogController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad PaletEtapaLog. Listar y
 *              crear entradas de bitácora del paso del palet por cada etapa
 *              RFID.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

export default class PaletEtapaLogController extends AbstractController {
    //Singleton
    private static _instance: PaletEtapaLogController;
    public static get instance(): PaletEtapaLogController {
        return this._instance ||
            (this._instance = new this("PaletEtapaLog"));
    }
    protected initRoutes(): void {
        this.router.get('/listarLogs',
            this.getListarLogs.bind(this));
        this.router.post('/crearLog',
            this.postCrearLog.bind(this));
        this.router.get('/:id', this.getLogPorId.bind(this));
        this.router.put('/:id', this.putActualizarLog.bind(this));
        this.router.delete('/:id', this.deleteLog.bind(this));
    }

    private async getListarLogs(req: Request, res: Response): Promise<void> {
        //SELECT * FROM PaletEtapaLog
        try {
            const logs = await db.PaletEtapaLog.findAll();
            res.status(200).json(logs);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
    private async postCrearLog(req: Request, res: Response): Promise<void> {
        //INSERT INTO PaletEtapaLog
        try {
            console.log(req.body);
            await db['PaletEtapaLog'].create(req.body);
            res.status(200).json({ message: "Registro de log de etapa exitoso" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    private async getLogPorId(req: Request, res: Response): Promise<void> {
        try {
            const log = await db.PaletEtapaLog.findByPk(req.params.id);
            if (!log) { res.status(404).json({ message: "Log no encontrado" }); return; }
            res.status(200).json(log);
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async putActualizarLog(req: Request, res: Response): Promise<void> {
        try {
            const log = await db.PaletEtapaLog.findByPk(req.params.id);
            if (!log) { res.status(404).json({ message: "Log no encontrado" }); return; }
            await log.update(req.body);
            res.status(200).json({ message: "Log actualizado exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async deleteLog(req: Request, res: Response): Promise<void> {
        try {
            const log = await db.PaletEtapaLog.findByPk(req.params.id);
            if (!log) { res.status(404).json({ message: "Log no encontrado" }); return; }
            await log.destroy();
            res.status(200).json({ message: "Log eliminado exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }


}