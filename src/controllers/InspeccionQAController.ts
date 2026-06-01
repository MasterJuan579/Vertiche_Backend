/* ============================================================================
 * Archivo: InspeccionQAController.ts
 * ──────────────────────────────────────────────────────────────────────────
 *  CONTROLLER COMPARTIDO con cambios del MÓDULO RFID.
 *  Cambios añadidos por team-rfid en postCrearInspeccion:
 *    - Si resultado === 'RECHAZADO':
 *        · Marca tag.qa_fallido = true
 *        · Setea tag.etapa_actual = 'RECHAZADO'
 *        · Crea Anomalia QA_FALLIDO automática
 *        · Emite por Socket.IO los eventos 'tag' y 'anomalia'
 *    - Cualquier otro resultado se inserta tal cual.
 *  team-proveedores: si tu UI manda inspecciones, no necesitas hacer nada
 *  extra — los efectos colaterales pasan acá. Solo asegúrate de mandar el
 *  body con tag_epc, proveedor_id y resultado en mayúsculas.
 *  Ver docs/RFID_MODULE.md.
 * ──────────────────────────────────────────────────────────────────────────
 * Generado originalmente por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad InspeccionQA. Listar,
 *              crear y consultar inspecciones de calidad sobre prepacks.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";
import { emit } from "../realtime/socketIo";

export default class InspeccionQAController extends AbstractController {
    private static _instance: InspeccionQAController;
    public static get instance(): InspeccionQAController {
        return this._instance ||
            (this._instance = new this("InspeccionQA"));
    }
    protected initRoutes(): void {
        this.router.get('/listarInspecciones', this.getListarInspecciones.bind(this));
        this.router.post('/crearInspeccion', this.postCrearInspeccion.bind(this));
        this.router.get('/:id', this.getInspeccionPorId.bind(this));
        this.router.put('/:id', this.putActualizarInspeccion.bind(this));
        this.router.delete('/:id', this.deleteInspeccion.bind(this));
    }

    private async getListarInspecciones(_req: Request, res: Response): Promise<void> {
        try {
            const inspecciones = await db.InspeccionQA.findAll();
            res.status(200).json(inspecciones);
        } catch (err: any) {
            console.error('[InspeccionQAController.listarInspecciones]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    /**
     * POST /InspeccionQA/crearInspeccion
     * Body: { tag_epc, proveedor_id, operador_id, resultado, defecto_tipo?, observacion?, fecha? }
     * Efectos colaterales:
     *   - Si resultado === 'RECHAZADO': tag.qa_fallido=true, etapa=RECHAZADO,
     *     crea Anomalia QA_FALLIDO, emite 'tag' y 'anomalia'.
     *   - Siempre: recalcula stats del Proveedor (stars/level/defect_rate/approval_rate/
     *     total_deliveries) basado en TODAS las inspecciones del proveedor en BD.
     *     Emite 'proveedor-actualizado' por socket para que el módulo Proveedores
     *     refresque su dashboard en vivo.
     */
    private async postCrearInspeccion(req: Request, res: Response): Promise<void> {
        try {
            const inspeccion: any = await db.InspeccionQA.create(req.body);
            const efectos: any = { anomalia: null, tagActualizado: null, proveedorActualizado: null };

            if (inspeccion.resultado === 'RECHAZADO' && inspeccion.tag_epc) {
                const tag: any = await db.Tag.findByPk(inspeccion.tag_epc);
                if (tag) {
                    await tag.update({ qa_fallido: true, etapa_actual: 'RECHAZADO' });
                    efectos.tagActualizado = {
                        epc: tag.epc,
                        etapa_actual: 'RECHAZADO',
                        qa_fallido: true,
                    };

                    const anom: any = await db.Anomalia.create({
                        epc: inspeccion.tag_epc,
                        tipo_error: 'QA_FALLIDO',
                        lector_id: null,
                        bahia: null,
                        etapa: 'QA',
                        timestamp: new Date(),
                        proveedor_id: inspeccion.proveedor_id,
                        resuelto: false,
                        descripcion: inspeccion.observacion || `Tag ${inspeccion.tag_epc} rechazado en QA (defecto: ${inspeccion.defecto_tipo || 'no especificado'}).`,
                    });
                    efectos.anomalia = anom;

                    emit('tag', efectos.tagActualizado);
                    emit('anomalia', anom);
                }
            }

            // Recalcular stats del proveedor (siempre, no solo en RECHAZADO)
            if (inspeccion.proveedor_id) {
                try {
                    efectos.proveedorActualizado = await this.recalcularStatsProveedor(inspeccion.proveedor_id);
                    if (efectos.proveedorActualizado) {
                        emit('proveedor-actualizado', efectos.proveedorActualizado);
                    }
                } catch (e: any) {
                    console.error('[recalcular stats proveedor]', e?.message);
                }
            }

            res.status(201).json({
                message: 'Registro de inspección QA exitoso',
                inspeccion,
                ...efectos,
            });
        } catch (err: any) {
            console.error('[InspeccionQAController.crearInspeccion]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    /**
     * Recalcula stats del Proveedor basado en sus inspecciones QA.
     *   approval_rate = aprobadas / total * 100
     *   defect_rate   = rechazadas / total * 100
     *   total_deliveries = total de inspecciones
     *   stars         = mapeo: >=95% → 5, >=85% → 4, >=70% → 3, >=50% → 2, resto → 1
     *   level         = stars >=4.5 ELITE, >=3 MEDIA, resto BAJA
     */
    private async recalcularStatsProveedor(proveedor_id: number): Promise<any> {
        const total: number = await db.InspeccionQA.count({ where: { proveedor_id } });
        if (total === 0) return null;

        const aprobadas: number = await db.InspeccionQA.count({ where: { proveedor_id, resultado: 'APROBADO' } });
        const rechazadas: number = await db.InspeccionQA.count({ where: { proveedor_id, resultado: 'RECHAZADO' } });

        const approval_rate = Math.round((aprobadas / total) * 100);
        const defect_rate = Math.round((rechazadas / total) * 100);

        let stars: number;
        if (approval_rate >= 95) stars = 5.0;
        else if (approval_rate >= 85) stars = 4.0;
        else if (approval_rate >= 70) stars = 3.0;
        else if (approval_rate >= 50) stars = 2.0;
        else stars = 1.0;

        let level: 'ELITE' | 'MEDIA' | 'BAJA';
        if (stars >= 4.5) level = 'ELITE';
        else if (stars >= 3) level = 'MEDIA';
        else level = 'BAJA';

        const proveedor: any = await db.Proveedor.findByPk(proveedor_id);
        if (!proveedor) return null;
        await proveedor.update({
            stars,
            level,
            approval_rate,
            defect_rate,
            total_deliveries: total,
        });

        return {
            id: proveedor_id,
            stars,
            level,
            approval_rate,
            defect_rate,
            total_deliveries: total,
        };
    }

    private async getInspeccionPorId(req: Request, res: Response): Promise<void> {
        try {
            const ins = await db.InspeccionQA.findByPk(req.params['id']);
            if (!ins) { res.status(404).json({ error: 'no_encontrado', message: "Inspección no encontrada" }); return; }
            res.status(200).json(ins);
        } catch (err: any) {
            console.error('[InspeccionQAController.getInspeccionPorId]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }
    private async putActualizarInspeccion(req: Request, res: Response): Promise<void> {
        try {
            const ins = await db.InspeccionQA.findByPk(req.params['id']);
            if (!ins) { res.status(404).json({ error: 'no_encontrado', message: "Inspección no encontrada" }); return; }
            await ins.update(req.body);
            res.status(200).json({ message: "Inspección actualizada exitosamente", inspeccion: ins });
        } catch (err: any) {
            console.error('[InspeccionQAController.actualizarInspeccion]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }
    private async deleteInspeccion(req: Request, res: Response): Promise<void> {
        try {
            const ins = await db.InspeccionQA.findByPk(req.params['id']);
            if (!ins) { res.status(404).json({ error: 'no_encontrado', message: "Inspección no encontrada" }); return; }
            await ins.destroy();
            res.status(200).json({ message: "Inspección eliminada exitosamente" });
        } catch (err: any) {
            console.error('[InspeccionQAController.deleteInspeccion]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }
}
