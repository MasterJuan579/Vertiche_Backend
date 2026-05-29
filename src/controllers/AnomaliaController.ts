/* ============================================================================
 * Archivo: AnomaliaController.ts
 * ──────────────────────────────────────────────────────────────────────────
 *  CONTROLLER COMPARTIDO con cambios del MÓDULO RFID.
 *  Cambios añadidos por team-rfid:
 *    - PATCH /Anomalia/:id/resolver (necesario para el botón ✕ de Bitácora).
 *    - Filtro ?resuelto=false en listarAnomalias.
 *    - Shape de error consistente { error, message }.
 *  Las anomalías se crean automáticamente desde RfidController e
 *  InspeccionQAController. Si tu módulo necesita crearlas manualmente,
 *  POST /Anomalia/crearAnomalia sigue disponible.
 *  Ver docs/RFID_MODULE.md sección "Detección automática de anomalías".
 * ──────────────────────────────────────────────────────────────────────────
 * Generado originalmente por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad Anomalia. Listar, crear,
 *              actualizar y resolver anomalías detectadas durante el flujo CD.
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
        this.router.get('/listarAnomalias', this.getListarAnomalias.bind(this));
        this.router.post('/crearAnomalia', this.postCrearAnomalia.bind(this));
        this.router.patch('/:id/resolver', this.patchResolverAnomalia.bind(this));
        this.router.get('/:id', this.getAnomaliaPorId.bind(this));
        this.router.put('/:id', this.putActualizarAnomalia.bind(this));
        this.router.delete('/:id', this.deleteAnomalia.bind(this));
    }

    // GET /Anomalia/listarAnomalias
    // Opcional: ?resuelto=false para filtrar las abiertas.
    private async getListarAnomalias(req: Request, res: Response): Promise<void> {
        try {
            const resueltoRaw = req.query['resuelto'] as string | undefined;
            const where: any = {};
            if (resueltoRaw === 'true') where.resuelto = true;
            else if (resueltoRaw === 'false') where.resuelto = false;

            const anomalias = await db.Anomalia.findAll({ where });
            res.status(200).json(anomalias);
        } catch (err: any) {
            console.error('[AnomaliaController.listarAnomalias]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al listar anomalías' });
        }
    }

    // POST /Anomalia/crearAnomalia
    private async postCrearAnomalia(req: Request, res: Response): Promise<void> {
        try {
            const created = await db.Anomalia.create(req.body);
            res.status(201).json({ message: 'Registro de anomalía exitoso', anomalia: created });
        } catch (err: any) {
            console.error('[AnomaliaController.crearAnomalia]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al crear anomalía' });
        }
    }

    // PATCH /Anomalia/:id/resolver
    // Marca la anomalía como resuelta y devuelve la versión actualizada.
    private async patchResolverAnomalia(req: Request, res: Response): Promise<void> {
        try {
            const anom = await db.Anomalia.findByPk(req.params['id']);
            if (!anom) {
                res.status(404).json({ error: 'no_encontrado', message: 'Anomalía no encontrada' });
                return;
            }
            await anom.update({ resuelto: true });
            res.status(200).json({ message: 'Anomalía resuelta', anomalia: anom });
        } catch (err: any) {
            console.error('[AnomaliaController.resolverAnomalia]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al resolver anomalía' });
        }
    }

    private async getAnomaliaPorId(req: Request, res: Response): Promise<void> {
        try {
            const anom = await db.Anomalia.findByPk(req.params['id']);
            if (!anom) { res.status(404).json({ error: 'no_encontrado', message: 'Anomalía no encontrada' }); return; }
            res.status(200).json(anom);
        } catch (err: any) {
            console.error('[AnomaliaController.getAnomaliaPorId]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al obtener anomalía' });
        }
    }
    private async putActualizarAnomalia(req: Request, res: Response): Promise<void> {
        try {
            const anom = await db.Anomalia.findByPk(req.params['id']);
            if (!anom) { res.status(404).json({ error: 'no_encontrado', message: 'Anomalía no encontrada' }); return; }
            await anom.update(req.body);
            res.status(200).json({ message: 'Anomalía actualizada exitosamente', anomalia: anom });
        } catch (err: any) {
            console.error('[AnomaliaController.actualizarAnomalia]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al actualizar anomalía' });
        }
    }
    private async deleteAnomalia(req: Request, res: Response): Promise<void> {
        try {
            const anom = await db.Anomalia.findByPk(req.params['id']);
            if (!anom) { res.status(404).json({ error: 'no_encontrado', message: 'Anomalía no encontrada' }); return; }
            await anom.destroy();
            res.status(200).json({ message: 'Anomalía eliminada exitosamente' });
        } catch (err: any) {
            console.error('[AnomaliaController.deleteAnomalia]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al eliminar anomalía' });
        }
    }
}
