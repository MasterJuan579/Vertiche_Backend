/* ============================================================================
 * Archivo: InspeccionQAController.ts
 * Descripción: Controller para inspecciones QA de prepacks.
 *
 *  SISTEMA DE PUNTUACIÓN POR DEFECTOS (checkboxes)
 *  ────────────────────────────────────────────────
 *  El operador marca checkboxes de defectos encontrados:
 *    0 defectos   → score = 5.0, resultado = APROBADO
 *    1 defecto    → score = 4.0, resultado = APROBADO
 *    2-4 defectos → score = 3.0, resultado = RETRABAJO
 *    5+ defectos  → score = 1.0, resultado = RECHAZADO
 *
 *  La reputación del proveedor se recalcula como promedio de TODOS los
 *  scores de inspecciones completadas (resultado ≠ PENDIENTE):
 *    stars = AVG(score)
 *
 *  Umbrales de nivel:
 *    stars ≥ 4.5  → ELITE  (color: ba) → cuota: 3
 *    stars ≥ 3.0  → MEDIA  (color: bb) → cuota: 5
 *    stars < 3.0  → BAJA   (color: bc) → cuota: 7
 *
 *  DEFECTOS DISPONIBLES (checkboxes):
 *    1. Mala calidad en la tela
 *    2. Ruptura o rasgadura
 *    3. Mancha o suciedad
 *    4. Costura defectuosa
 *    5. Etiqueta incorrecta
 *    6. Cantidad faltante
 *    7. SKU equivocado
 *    8. Otro (especificar)
 *
 *  EFECTOS COLATERALES
 *  ───────────────────
 *  · Si resultado === 'RECHAZADO': tag.qa_fallido=true, etapa=RECHAZADO,
 *    crea Anomalia QA_FALLIDO, emite socket 'tag' y 'anomalia'.
 *  · Siempre: recalcula stats del proveedor, emite 'proveedor-actualizado'.
 * ============================================================================ */
import { Request, Response } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import AbstractController from './AbstractController';
import db from '../models';
import { verifyToken } from '../middleware/verifyToken';
import { emit } from '../realtime/socketIo';

export default class InspeccionQAController extends AbstractController {
    private static _instance: InspeccionQAController;
    public static get instance(): InspeccionQAController {
        return this._instance || (this._instance = new this('InspeccionQA'));
    }

    protected initRoutes(): void {
        this.router.use(verifyToken);
        this.router.get('/listarInspecciones', this.getListarInspecciones.bind(this));
        this.router.post('/crearInspeccion',   this.postCrearInspeccion.bind(this));
        this.router.get('/:id',                this.getInspeccionPorId.bind(this));
        this.router.put('/:id',                this.putActualizarInspeccion.bind(this));
        this.router.delete('/:id',             this.deleteInspeccion.bind(this));
    }

    private calcularCuota(stars: number): number {
        if (stars >= 4.5) return 3;
        if (stars >= 3.0) return 5;
        return 7;
    }

    private calcularScoreYResultado(numDefectos: number): { score: number; resultado: string } {
        if (numDefectos === 0) return { score: 5.0, resultado: 'APROBADO' };
        if (numDefectos === 1) return { score: 4.0, resultado: 'APROBADO' };
        if (numDefectos <= 4)  return { score: 3.0, resultado: 'RETRABAJO' };
        return { score: 1.0, resultado: 'RECHAZADO' };
    }

    // ── GET /listarInspecciones ───────────────────────────────────────────────
    private async getListarInspecciones(_req: Request, res: Response): Promise<void> {
        try {
            const inspecciones = await db.InspeccionQA.findAll();
            res.status(200).json(inspecciones);
        } catch (err: any) {
            console.error('[InspeccionQAController.listarInspecciones]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // ── POST /crearInspeccion ─────────────────────────────────────────────────
    private async postCrearInspeccion(req: Request, res: Response): Promise<void> {
        try {
            const { defectos, defecto_tipo, resultado: resultadoManual, ...bodyResto } = req.body;

            // 1. Extraer lista de defectos (acepta array nuevo o string legacy)
            let nombresDefectos: string[] = [];

            if (Array.isArray(defectos) && defectos.length > 0) {
                nombresDefectos = defectos;
            } else if (typeof defecto_tipo === 'string' && defecto_tipo.trim().length > 0) {
                nombresDefectos = defecto_tipo
                    .split(',')
                    .map((s: string) => s.trim())
                    .filter(Boolean);
            }

            // 2. Calcular score y resultado según cantidad de defectos
            const { score, resultado } = this.calcularScoreYResultado(nombresDefectos.length);
            const defecto_tipo_final = nombresDefectos.join(', ');

            // 3. Persistir la inspección
            const inspeccion: any = await db.InspeccionQA.create({
                ...bodyResto,
                defecto_tipo: defecto_tipo_final || null,
                resultado: resultadoManual || resultado,
                score,
                nota_revision: score,
                fecha: bodyResto.fecha || new Date()
            });

            const efectos: any = { anomalia: null, tagActualizado: null, proveedorActualizado: null };

            // 4. Efectos colaterales si RECHAZADO
            if (inspeccion.resultado === 'RECHAZADO' && inspeccion.tag_epc) {
                const tag: any = await db.Tag.findByPk(inspeccion.tag_epc);
                if (tag) {
                    await tag.update({ qa_fallido: true, etapa_actual: 'RECHAZADO' });
                    efectos.tagActualizado = {
                        epc: tag.epc,
                        etapa_actual: 'RECHAZADO',
                        qa_fallido: true
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
                        descripcion: inspeccion.observacion ||
                            `Tag ${inspeccion.tag_epc} rechazado en QA (defectos: ${defecto_tipo_final || 'no especificado'}).`
                    });
                    efectos.anomalia = anom;
                    emit('tag', efectos.tagActualizado);
                    emit('anomalia', anom);
                }
            }

            // 5. Recalcular reputación del proveedor (siempre)
            if (inspeccion.proveedor_id) {
                try {
                    efectos.proveedorActualizado = await this.recalcularStatsProveedor(
                        inspeccion.proveedor_id
                    );
                    if (efectos.proveedorActualizado) {
                        emit('proveedor-actualizado', efectos.proveedorActualizado);
                    }
                } catch (e: any) {
                    console.error('[recalcular stats proveedor]', e?.message);
                }
            }

            // 6. Cuota próxima basada en las nuevas stars
            const stars_nuevo = efectos.proveedorActualizado?.stars ?? 0;
            const cuota_proxima = this.calcularCuota(stars_nuevo);

            res.status(201).json({
                message: 'Registro de inspección QA exitoso',
                inspeccion_id: inspeccion.id,
                defectos_encontrados: nombresDefectos.length,
                score,
                resultado: inspeccion.resultado,
                stars_anterior:  efectos.proveedorActualizado?.stars_anterior ?? 0,
                stars_nuevo:     efectos.proveedorActualizado?.stars          ?? 0,
                level_nuevo:     efectos.proveedorActualizado?.level          ?? 'NUEVO',
                color_nuevo:     efectos.proveedorActualizado?.color          ?? 'bn',
                cuota_proxima,
                ...efectos
            });
        } catch (err: any) {
            console.error('[InspeccionQAController.crearInspeccion]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    private async recalcularStatsProveedor(proveedor_id: number): Promise<any> {
        const stats: any = await db.InspeccionQA.findOne({
            where: {
                proveedor_id,
                resultado: { [Op.ne]: 'PENDIENTE' }
            },
            attributes: [
                [fn('AVG', col('score')), 'avg_score'],
                [fn('COUNT', col('id')), 'total'],
                [fn('SUM', literal("CASE WHEN resultado = 'APROBADO' THEN 1 ELSE 0 END")), 'aprobadas'],
                [fn('SUM', literal("CASE WHEN resultado = 'RECHAZADO' THEN 1 ELSE 0 END")), 'rechazadas']
            ],
            raw: true
        });

        const total = parseInt(stats?.total) || 0;
        if (total === 0) return null;

        const stars      = parseFloat(parseFloat(stats.avg_score || '0').toFixed(1));
        const aprobadas  = parseInt(stats.aprobadas)  || 0;
        const rechazadas = parseInt(stats.rechazadas) || 0;
        const approval_rate = Math.round((aprobadas  / total) * 100);
        const defect_rate   = Math.round((rechazadas / total) * 100);

        let level: string;
        let color: string;
        if (stars >= 4.5)      { level = 'ELITE'; color = 'ba'; }
        else if (stars >= 3.0) { level = 'MEDIA'; color = 'bb'; }
        else                   { level = 'BAJA';  color = 'bc'; }

        const proveedor: any = await db.Proveedor.findByPk(proveedor_id);
        if (!proveedor) return null;

        const stars_anterior = parseFloat(proveedor.stars) || 0;

        await proveedor.update({ stars, level, color, approval_rate, defect_rate, total_deliveries: total });

        return { id: proveedor_id, stars_anterior, stars, level, color, approval_rate, defect_rate, total_deliveries: total };
    }

    // ── GET /:id ──────────────────────────────────────────────────────────────
    private async getInspeccionPorId(req: Request, res: Response): Promise<void> {
        try {
            const ins = await db.InspeccionQA.findByPk(req.params['id']);
            if (!ins) {
                res.status(404).json({ error: 'no_encontrado', message: 'Inspección no encontrada' });
                return;
            }
            res.status(200).json(ins);
        } catch (err: any) {
            console.error('[InspeccionQAController.getInspeccionPorId]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // ── PUT /:id ──────────────────────────────────────────────────────────────
    private async putActualizarInspeccion(req: Request, res: Response): Promise<void> {
        try {
            const ins = await db.InspeccionQA.findByPk(req.params['id']);
            if (!ins) {
                res.status(404).json({ error: 'no_encontrado', message: 'Inspección no encontrada' });
                return;
            }
            await ins.update(req.body);
            res.status(200).json({ message: 'Inspección actualizada exitosamente', inspeccion: ins });
        } catch (err: any) {
            console.error('[InspeccionQAController.actualizarInspeccion]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // ── DELETE /:id ───────────────────────────────────────────────────────────
    private async deleteInspeccion(req: Request, res: Response): Promise<void> {
        try {
            const ins = await db.InspeccionQA.findByPk(req.params['id']);
            if (!ins) {
                res.status(404).json({ error: 'no_encontrado', message: 'Inspección no encontrada' });
                return;
            }
            await ins.destroy();
            res.status(200).json({ message: 'Inspección eliminada exitosamente' });
        } catch (err: any) {
            console.error('[InspeccionQAController.deleteInspeccion]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }
}
