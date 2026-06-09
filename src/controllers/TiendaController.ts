/* ============================================================================
 * Archivo: TiendaController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad Tienda. Listar y crear
 *              tiendas destino.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";
import { verifyToken } from "../middleware/verifyToken";

export default class TiendaController extends AbstractController {
    //Singleton
    private static _instance: TiendaController;
    public static get instance(): TiendaController {
        return this._instance ||
            (this._instance = new this("Tienda"));
    }
    protected initRoutes(): void {
        this.router.use(verifyToken);
        this.router.get('/listarTiendas',
            this.getListarTiendas.bind(this));
        this.router.post('/crearTienda',
            this.postCrearTienda.bind(this));

        this.router.get('/:id', this.getTiendaPorId.bind(this));
        this.router.put('/:id', this.putActualizarTienda.bind(this));
        this.router.delete('/:id', this.deleteTienda.bind(this));
    }

    private async getListarTiendas(req: Request, res: Response): Promise<void> {
        //SELECT * FROM Tienda
        try {
            const tiendas = await db.Tienda.findAll();
            res.status(200).json(tiendas);
        } catch (err: any) {
            console.error('[TiendaController.listarTiendas]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al listar tiendas' });
        }
    }
    private async postCrearTienda(req: Request, res: Response): Promise<void> {
        //INSERT INTO Tienda
        try {
            console.log(req.body);
            await db['Tienda'].create(req.body);
            res.status(200).json({ message: "Registro de tienda exitoso" });
        } catch (err: any) {
            console.error('[TiendaController.crearTienda]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al crear tienda' });
        }
    }

    private async getTiendaPorId(req: Request, res: Response): Promise<void> {
        try {
            const tienda = await db.Tienda.findByPk(req.params.id);
            if (!tienda) { res.status(404).json({ error: 'no_encontrado', message: "Tienda no encontrada" }); return; }
            res.status(200).json(tienda);
        } catch (err: any) { console.error('[TiendaController.getTiendaPorId]', err); res.status(500).json({ error: 'error_interno', message: err.message || 'Error al obtener tienda' }); }
    }
    private async putActualizarTienda(req: Request, res: Response): Promise<void> {
        try {
            const tienda = await db.Tienda.findByPk(req.params.id);
            if (!tienda) { res.status(404).json({ error: 'no_encontrado', message: "Tienda no encontrada" }); return; }
            await tienda.update(req.body);
            res.status(200).json({ message: "Tienda actualizada exitosamente" });
        } catch (err: any) { console.error('[TiendaController.actualizarTienda]', err); res.status(500).json({ error: 'error_interno', message: err.message || 'Error al actualizar tienda' }); }
    }
    private async deleteTienda(req: Request, res: Response): Promise<void> {
        try {
            const tienda = await db.Tienda.findByPk(req.params.id);
            if (!tienda) { res.status(404).json({ error: 'no_encontrado', message: "Tienda no encontrada" }); return; }
            await tienda.destroy();
            res.status(200).json({ message: "Tienda eliminada exitosamente" });
        } catch (err: any) { console.error('[TiendaController.deleteTienda]', err); res.status(500).json({ error: 'error_interno', message: err.message || 'Error al eliminar tienda' }); }
    }
}
