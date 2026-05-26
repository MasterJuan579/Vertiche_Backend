/* ============================================================================
 * Archivo: AnomaliaController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad Anomalia. Listar y
 *              registrar anomalías detectadas durante el flujo del CD.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

export default class AnomaliaController extends AbstractController {
    //Singleton
    private static _instance: AnomaliaController;
    public static get instance(): AnomaliaController {
        return this._instance ||
            (this._instance = new this("Anomalia"));
    }
    protected initRoutes(): void {
        this.router.get('/listarAnomalias',
            this.getListarAnomalias.bind(this));
        this.router.post('/crearAnomalia',
            this.postCrearAnomalia.bind(this));

        this.router.get('/:id', this.getAnomaliaPorId.bind(this));
        this.router.put('/:id', this.putActualizarAnomalia.bind(this));
        this.router.delete('/:id', this.deleteAnomalia.bind(this));
    }

    private async getListarAnomalias(req: Request, res: Response): Promise<void> {
        //SELECT * FROM Anomalia
        try {
            const anomalias = await db.Anomalia.findAll();
            res.status(200).json(anomalias);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
    private async postCrearAnomalia(req: Request, res: Response): Promise<void> {
        //INSERT INTO Anomalia
        try {
            console.log(req.body);
            await db['Anomalia'].create(req.body);
            res.status(200).json({ message: "Registro de anomalía exitoso" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
    private async getAnomaliaPorId(req: Request, res: Response): Promise<void> {
        try {
            const anom = await db.Anomalia.findByPk(req.params.id);
            if (!anom) { res.status(404).json({ message: "Anomalía no encontrada" }); return; }
            res.status(200).json(anom);
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async putActualizarAnomalia(req: Request, res: Response): Promise<void> {
        try {
            const anom = await db.Anomalia.findByPk(req.params.id);
            if (!anom) { res.status(404).json({ message: "Anomalía no encontrada" }); return; }
            await anom.update(req.body);
            res.status(200).json({ message: "Anomalía actualizada exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async deleteAnomalia(req: Request, res: Response): Promise<void> {
        try {
            const anom = await db.Anomalia.findByPk(req.params.id);
            if (!anom) { res.status(404).json({ message: "Anomalía no encontrada" }); return; }
            await anom.destroy();
            res.status(200).json({ message: "Anomalía eliminada exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
}