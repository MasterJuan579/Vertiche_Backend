/* ============================================================================
 * Archivo: CajaController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad Caja. Listar y crear
 *              cajas de salida hacia las tiendas.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";
import { verifyToken } from "../middleware/verifyToken";

export default class CajaController extends AbstractController {
    //Singleton
    private static _instance: CajaController;
    public static get instance(): CajaController {
        return this._instance ||
            (this._instance = new this("Caja"));
    }
    protected initRoutes(): void {
        this.router.use(verifyToken);
        this.router.get('/listarCajas',
            this.getListarCajas.bind(this));
        this.router.post('/crearCaja',
            this.postCrearCaja.bind(this));
        this.router.get('/:id', this.getCajaPorId.bind(this));
        this.router.put('/:id', this.putActualizarCaja.bind(this));
        this.router.delete('/:id', this.deleteCaja.bind(this));
    }

    private async getListarCajas(req: Request, res: Response): Promise<void> {
        //SELECT * FROM Caja
        try {
            const cajas = await db.Caja.findAll();
            res.status(200).json(cajas);
        } catch (err: any) {
            console.error('[CajaController.listarCajas]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al listar cajas' });
        }
    }
    private async postCrearCaja(req: Request, res: Response): Promise<void> {
        //INSERT INTO Caja
        try {
            console.log(req.body);
            await db['Caja'].create(req.body);
            res.status(200).json({ message: "Registro de caja exitoso" });
        } catch (err: any) {
            console.error('[CajaController.crearCaja]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al crear caja' });
        }
    }

    private async getCajaPorId(req: Request, res: Response): Promise<void> {
        try {
            const caja = await db.Caja.findByPk(req.params.id);
            if (!caja) { res.status(404).json({ error: 'no_encontrado', message: "Caja no encontrada" }); return; }
            res.status(200).json(caja);
        } catch (err: any) { console.error('[CajaController.getCajaPorId]', err); res.status(500).json({ error: 'error_interno', message: err.message || 'Error al obtener caja' }); }
    }
    private async putActualizarCaja(req: Request, res: Response): Promise<void> {
        try {
            const caja = await db.Caja.findByPk(req.params.id);
            if (!caja) { res.status(404).json({ error: 'no_encontrado', message: "Caja no encontrada" }); return; }
            await caja.update(req.body);
            res.status(200).json({ message: "Caja actualizada exitosamente" });
        } catch (err: any) { console.error('[CajaController.actualizarCaja]', err); res.status(500).json({ error: 'error_interno', message: err.message || 'Error al actualizar caja' }); }
    }
    private async deleteCaja(req: Request, res: Response): Promise<void> {
        try {
            const caja = await db.Caja.findByPk(req.params.id);
            if (!caja) { res.status(404).json({ error: 'no_encontrado', message: "Caja no encontrada" }); return; }
            await caja.destroy();
            res.status(200).json({ message: "Caja eliminada exitosamente" });
        } catch (err: any) { console.error('[CajaController.deleteCaja]', err); res.status(500).json({ error: 'error_interno', message: err.message || 'Error al eliminar caja' }); }
    }
}
