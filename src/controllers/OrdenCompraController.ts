/* ============================================================================
 * Archivo: OrdenCompraController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad OrdenCompra. Listar y
 *              crear órdenes de compra (cabecera).
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

export default class OrdenCompraController extends AbstractController {
    //Singleton
    private static _instance: OrdenCompraController;
    public static get instance(): OrdenCompraController {
        return this._instance ||
            (this._instance = new this("OrdenCompra"));
    }
    protected initRoutes(): void {
        this.router.get('/listarOrdenes',
            this.getListarOrdenes.bind(this));
        this.router.post('/crearOrden',
            this.postCrearOrden.bind(this));

        this.router.get('/:id', this.getOrdenPorId.bind(this));
        this.router.put('/:id', this.putActualizarOrden.bind(this));
        this.router.delete('/:id', this.deleteOrden.bind(this));
    }

    private async getListarOrdenes(req: Request, res: Response): Promise<void> {
        //SELECT * FROM OrdenCompra
        try {
            const ordenes = await db.OrdenCompra.findAll();
            res.status(200).json(ordenes);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
    private async postCrearOrden(req: Request, res: Response): Promise<void> {
        //INSERT INTO OrdenCompra
        try {
            console.log(req.body);
            await db['OrdenCompra'].create(req.body);
            res.status(200).json({ message: "Registro de orden de compra exitoso" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    private async getOrdenPorId(req: Request, res: Response): Promise<void> {
        try {
            const orden = await db.OrdenCompra.findByPk(req.params.id);
            if (!orden) { res.status(404).json({ message: "Orden no encontrada" }); return; }
            res.status(200).json(orden);
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async putActualizarOrden(req: Request, res: Response): Promise<void> {
        try {
            const orden = await db.OrdenCompra.findByPk(req.params.id);
            if (!orden) { res.status(404).json({ message: "Orden no encontrada" }); return; }
            await orden.update(req.body);
            res.status(200).json({ message: "Orden actualizada exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async deleteOrden(req: Request, res: Response): Promise<void> {
        try {
            const orden = await db.OrdenCompra.findByPk(req.params.id);
            if (!orden) { res.status(404).json({ message: "Orden no encontrada" }); return; }
            await orden.destroy();
            res.status(200).json({ message: "Orden eliminada exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
}