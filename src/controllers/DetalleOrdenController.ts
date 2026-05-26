/* ============================================================================
 * Archivo: DetalleOrdenController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad DetalleOrden. Listar y
 *              crear líneas de detalle de una orden de compra.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

export default class DetalleOrdenController extends AbstractController {
    //Singleton
    private static _instance: DetalleOrdenController;
    public static get instance(): DetalleOrdenController {
        return this._instance ||
            (this._instance = new this("DetalleOrden"));
    }
    protected initRoutes(): void {
        this.router.get('/listarDetalles',
            this.getListarDetalles.bind(this));
        this.router.post('/crearDetalle',
            this.postCrearDetalle.bind(this));
        this.router.get('/:id', this.getDetallePorId.bind(this));
        this.router.put('/:id', this.putActualizarDetalle.bind(this));
        this.router.delete('/:id', this.deleteDetalle.bind(this));
    }

    private async getListarDetalles(req: Request, res: Response): Promise<void> {
        //SELECT * FROM DetalleOrden
        try {
            const detalles = await db.DetalleOrden.findAll();
            res.status(200).json(detalles);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
    private async postCrearDetalle(req: Request, res: Response): Promise<void> {
        //INSERT INTO DetalleOrden
        try {
            console.log(req.body);
            await db['DetalleOrden'].create(req.body);
            res.status(200).json({ message: "Registro de detalle de orden exitoso" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    private async getDetallePorId(req: Request, res: Response): Promise<void> {
        try {
            const detalle = await db.DetalleOrden.findByPk(req.params.id);
            if (!detalle) { res.status(404).json({ message: "Detalle no encontrado" }); return; }
            res.status(200).json(detalle);
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async putActualizarDetalle(req: Request, res: Response): Promise<void> {
        try {
            const detalle = await db.DetalleOrden.findByPk(req.params.id);
            if (!detalle) { res.status(404).json({ message: "Detalle no encontrado" }); return; }
            await detalle.update(req.body);
            res.status(200).json({ message: "Detalle actualizado exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async deleteDetalle(req: Request, res: Response): Promise<void> {
        try {
            const detalle = await db.DetalleOrden.findByPk(req.params.id);
            if (!detalle) { res.status(404).json({ message: "Detalle no encontrado" }); return; }
            await detalle.destroy();
            res.status(200).json({ message: "Detalle eliminado exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
}