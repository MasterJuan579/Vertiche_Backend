/* ============================================================================
 * Archivo: PrepackCajaController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad PrepackCaja (tabla
 *              puente). Listar y vincular un prepack (Tag) a una Caja.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

export default class PrepackCajaController extends AbstractController {
    //Singleton
    private static _instance: PrepackCajaController;
    public static get instance(): PrepackCajaController {
        return this._instance ||
            (this._instance = new this("PrepackCaja"));
    }
    protected initRoutes(): void {
        this.router.get('/listarVinculaciones',
            this.getListarVinculaciones.bind(this));
        this.router.post('/crearVinculacion',
            this.postCrearVinculacion.bind(this));
        this.router.get('/:id', this.getVinculacionPorId.bind(this));
        this.router.put('/:id', this.putActualizarVinculacion.bind(this));
        this.router.delete('/:id', this.deleteVinculacion.bind(this));
    }

    private async getListarVinculaciones(req: Request, res: Response): Promise<void> {
        //SELECT * FROM PrepackCaja
        try {
            const vinculaciones = await db.PrepackCaja.findAll();
            res.status(200).json(vinculaciones);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
    private async postCrearVinculacion(req: Request, res: Response): Promise<void> {
        //INSERT INTO PrepackCaja
        try {
            console.log(req.body);
            await db['PrepackCaja'].create(req.body);
            res.status(200).json({ message: "Vinculación de prepack a caja exitosa" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
    private async getVinculacionPorId(req: Request, res: Response): Promise<void> {
        try {
            const v = await db.PrepackCaja.findByPk(req.params.id);
            if (!v) { res.status(404).json({ message: "Vinculación no encontrada" }); return; }
            res.status(200).json(v);
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async putActualizarVinculacion(req: Request, res: Response): Promise<void> {
        try {
            const v = await db.PrepackCaja.findByPk(req.params.id);
            if (!v) { res.status(404).json({ message: "Vinculación no encontrada" }); return; }
            await v.update(req.body);
            res.status(200).json({ message: "Vinculación actualizada exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async deleteVinculacion(req: Request, res: Response): Promise<void> {
        try {
            const v = await db.PrepackCaja.findByPk(req.params.id);
            if (!v) { res.status(404).json({ message: "Vinculación no encontrada" }); return; }
            await v.destroy();
            res.status(200).json({ message: "Vinculación eliminada exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
}