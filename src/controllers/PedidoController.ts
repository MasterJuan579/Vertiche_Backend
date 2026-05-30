/* ============================================================================
 * Archivo: PedidoController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad Pedido. Listar y crear
 *              pedidos (envíos físicos del proveedor al CD).
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

export default class PedidoController extends AbstractController {
    //Singleton
    private static _instance: PedidoController;
    public static get instance(): PedidoController {
        return this._instance ||
            (this._instance = new this("Pedido"));
    }
    protected initRoutes(): void {
        this.router.get('/listarPedidos',
            this.getListarPedidos.bind(this));
        this.router.post('/crearPedido',
            this.postCrearPedido.bind(this));
        this.router.get('/:id', this.getPedidoPorId.bind(this));
        this.router.put('/:id', this.putActualizarPedido.bind(this));
        this.router.delete('/:id', this.deletePedido.bind(this));
    }

    private async getListarPedidos(req: Request, res: Response): Promise<void> {
        //SELECT * FROM Pedido
        try {
            const pedidos = await db.Pedido.findAll();
            res.status(200).json(pedidos);
        } catch (err: any) {
            console.error('[PedidoController.listarPedidos]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al listar pedidos' });
        }
    }
    private async postCrearPedido(req: Request, res: Response): Promise<void> {
        //INSERT INTO Pedido
        try {
            console.log(req.body);
            await db['Pedido'].create(req.body);
            res.status(200).json({ message: "Registro de pedido exitoso" });
        } catch (err: any) {
            console.error('[PedidoController.crearPedido]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al crear pedido' });
        }
    }

    private async getPedidoPorId(req: Request, res: Response): Promise<void> {
        try {
            const pedido = await db.Pedido.findByPk(req.params.id);
            if (!pedido) { res.status(404).json({ error: 'no_encontrado', message: "Pedido no encontrado" }); return; }
            res.status(200).json(pedido);
        } catch (err: any) { console.error('[PedidoController.getPedidoPorId]', err); res.status(500).json({ error: 'error_interno', message: err.message || 'Error al obtener pedido' }); }
    }
    private async putActualizarPedido(req: Request, res: Response): Promise<void> {
        try {
            const pedido = await db.Pedido.findByPk(req.params.id);
            if (!pedido) { res.status(404).json({ error: 'no_encontrado', message: "Pedido no encontrado" }); return; }
            await pedido.update(req.body);
            res.status(200).json({ message: "Pedido actualizado exitosamente" });
        } catch (err: any) { console.error('[PedidoController.actualizarPedido]', err); res.status(500).json({ error: 'error_interno', message: err.message || 'Error al actualizar pedido' }); }
    }
    private async deletePedido(req: Request, res: Response): Promise<void> {
        try {
            const pedido = await db.Pedido.findByPk(req.params.id);
            if (!pedido) { res.status(404).json({ error: 'no_encontrado', message: "Pedido no encontrado" }); return; }
            await pedido.destroy();
            res.status(200).json({ message: "Pedido eliminado exitosamente" });
        } catch (err: any) { console.error('[PedidoController.deletePedido]', err); res.status(500).json({ error: 'error_interno', message: err.message || 'Error al eliminar pedido' }); }
    }
}
