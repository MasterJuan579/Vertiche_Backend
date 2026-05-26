/* ============================================================================
 * Archivo: InspeccionQAController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad InspeccionQA. Listar y
 *              crear inspecciones de calidad sobre prepacks.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

export default class InspeccionQAController extends AbstractController {
    //Singleton
    private static _instance: InspeccionQAController;
    public static get instance(): InspeccionQAController {
        return this._instance ||
            (this._instance = new this("InspeccionQA"));
    }
    protected initRoutes(): void {
        this.router.get('/listarInspecciones',
            this.getListarInspecciones.bind(this));
        this.router.post('/crearInspeccion',
            this.postCrearInspeccion.bind(this));
        this.router.get('/:id', this.getInspeccionPorId.bind(this));
        this.router.put('/:id', this.putActualizarInspeccion.bind(this));
        this.router.delete('/:id', this.deleteInspeccion.bind(this));
    }

    private async getListarInspecciones(req: Request, res: Response): Promise<void> {
        //SELECT * FROM InspeccionQA
        try {
            const inspecciones = await db.InspeccionQA.findAll();
            res.status(200).json(inspecciones);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
    private async postCrearInspeccion(req: Request, res: Response): Promise<void> {
        //INSERT INTO InspeccionQA
        try {
            console.log(req.body);
            await db['InspeccionQA'].create(req.body);
            res.status(200).json({ message: "Registro de inspección QA exitoso" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    private async getInspeccionPorId(req: Request, res: Response): Promise<void> {
        try {
            const ins = await db.InspeccionQA.findByPk(req.params.id);
            if (!ins) { res.status(404).json({ message: "Inspección no encontrada" }); return; }
            res.status(200).json(ins);
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async putActualizarInspeccion(req: Request, res: Response): Promise<void> {
        try {
            const ins = await db.InspeccionQA.findByPk(req.params.id);
            if (!ins) { res.status(404).json({ message: "Inspección no encontrada" }); return; }
            await ins.update(req.body);
            res.status(200).json({ message: "Inspección actualizada exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async deleteInspeccion(req: Request, res: Response): Promise<void> {
        try {
            const ins = await db.InspeccionQA.findByPk(req.params.id);
            if (!ins) { res.status(404).json({ message: "Inspección no encontrada" }); return; }
            await ins.destroy();
            res.status(200).json({ message: "Inspección eliminada exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
}