/* ============================================================================
 * Archivo: InspeccionQAController.ts
 * Descripción: Controller para inspecciones QA de prepacks.
 *
 *  SISTEMA DE PENALIZACIÓN POR GRAVEDAD
 *  ─────────────────────────────────────
 *  Cada inspección parte de 5.0 estrellas y descuenta penalizaciones según
 *  los defectos seleccionados por el operador (lookup en CatalogoDefecto).
 *
 *    score = max(0, 5.0 − Σ penalizaciones)
 *
 *  La reputación histórica del proveedor se actualiza como promedio ponderado
 *  de TODOS los scores de sus inspecciones completadas (resultado ≠ PENDIENTE):
 *
 *    stars = AVG(score) sobre todas las inspecciones del proveedor
 *
 *  Umbrales de nivel:
 *    stars ≥ 4.5  → ELITE  (color: ba)
 *    stars ≥ 3.5  → MEDIA  (color: bb)
 *    stars ≥ 1.0  → BAJA   (color: bc)
 *    sin datos    → NUEVO  (color: bn)
 *
 *  CONTRATOS CON EL FRONTEND
 *  ─────────────────────────
 *  POST /InspeccionQA/crearInspeccion — acepta ambos formatos:
 *    · Nuevo:  { defectos: ["Costura defectuosa", "Etiqueta incorrecta"], ... }
 *    · Legacy: { defecto_tipo: "Costura defectuosa, Etiqueta incorrecta", ... }
 *    resultado: "APROBADO" | "OBSERVADO" | "RECHAZADO" | "RETRABAJO" | "PENDIENTE"
 *
 *  Respuesta enriquecida:
 *    { inspeccion_id, nota_revision, stars_anterior, stars_nuevo,
 *      level_nuevo, color_nuevo, cuota_proxima_turno, ... }
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
import { emit } from '../realtime/socketIo';
import { calcularCuota, getRangoHoy } from '../utils/qaUtils';

export default class InspeccionQAController extends AbstractController {
    private static _instance: InspeccionQAController;
    public static get instance(): InspeccionQAController {
        return this._instance || (this._instance = new this('InspeccionQA'));
    }

    protected initRoutes(): void {
        this.router.get('/listarInspecciones', this.getListarInspecciones.bind(this));
        this.router.post('/crearInspeccion',   this.postCrearInspeccion.bind(this));
        this.router.get('/:id',                this.getInspeccionPorId.bind(this));
        this.router.put('/:id',                this.putActualizarInspeccion.bind(this));
        this.router.delete('/:id',             this.deleteInspeccion.bind(this));
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
            const { defectos, defecto_tipo, ...bodyResto } = req.body;

            // 1. Calcular score a partir de los defectos seleccionados
            let score = 5.0;
            let defecto_tipo_final = typeof defecto_tipo === 'string' ? defecto_tipo : '';

            const tieneDefectos =
                (Array.isArray(defectos) && defectos.length > 0) ||
                (typeof defecto_tipo === 'string' && defecto_tipo.trim().length > 0);

            if (tieneDefectos) {
                const catalogo: any[] = await db.CatalogoDefecto.findAll({
                    where: { activo: true },
                    raw: true
                });
                const penMap = new Map<string, number>(
                    catalogo.map((d: any) => [d.nombre, parseFloat(d.penalizacion)])
                );

                let nombresDefectos: string[];
                if (Array.isArray(defectos) && defectos.length > 0) {
                    // Formato nuevo: array de nombres
                    nombresDefectos = defectos;
                    defecto_tipo_final = defectos.join(', ');
                } else {
                    // Formato legacy: string separado por comas
                    nombresDefectos = (defecto_tipo as string)
                        .split(',')
                        .map((s: string) => s.trim())
                        .filter(Boolean);
                }

                let penTotal = 0;
                for (const nombre of nombresDefectos) {
                    // Strings no encontrados en catálogo se tratan como MENOR (0.5)
                    penTotal += penMap.get(nombre) ?? 0.5;
                }
                score = parseFloat(Math.max(0, 5.0 - penTotal).toFixed(1));
            }

            // 2. Persistir la inspección con su score calculado
            const inspeccion: any = await db.InspeccionQA.create({
                ...bodyResto,
                defecto_tipo: defecto_tipo_final,
                score
            });

            const efectos: any = { anomalia: null, tagActualizado: null, proveedorActualizado: null };

            // 3. Efectos colaterales si RECHAZADO
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

            // 4. Recalcular reputación del proveedor (siempre)
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

            // 5. Cuota próxima para respuesta enriquecida
            const { hoy, manana } = getRangoHoy();
            const totalHoy: number = await db.Tag.count({
                where: {
                    proveedor_id: inspeccion.proveedor_id,
                    registrado_en: { [Op.gte]: hoy, [Op.lt]: manana }
                }
            });
            const stars_nuevo = efectos.proveedorActualizado?.stars
                ?? efectos.proveedorActualizado?.stars_anterior
                ?? 0;
            const cuota_proxima_turno = calcularCuota(stars_nuevo, totalHoy);

            res.status(201).json({
                message: 'Registro de inspección QA exitoso',
                inspeccion,
                inspeccion_id: inspeccion.id,
                nota_revision: score,
                stars_anterior:        efectos.proveedorActualizado?.stars_anterior ?? 0,
                stars_nuevo:           efectos.proveedorActualizado?.stars          ?? 0,
                level_nuevo:           efectos.proveedorActualizado?.level          ?? 'NUEVO',
                color_nuevo:           efectos.proveedorActualizado?.color          ?? 'bn',
                cuota_proxima_turno,
                ...efectos
            });
        } catch (err: any) {
            console.error('[InspeccionQAController.crearInspeccion]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    /**
     * Recalcula la reputación del proveedor usando el promedio ponderado de
     * todos los scores de inspecciones completadas (resultado ≠ PENDIENTE).
     * Devuelve los valores anteriores y nuevos para la respuesta enriquecida.
     */
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
        if (stars >= 4.5) { level = 'ELITE'; color = 'ba'; }
        else if (stars >= 3.5) { level = 'MEDIA'; color = 'bb'; }
        else { level = 'BAJA'; color = 'bc'; }

        const proveedor: any = await db.Proveedor.findByPk(proveedor_id);
        if (!proveedor) return null;

        const stars_anterior = parseFloat(proveedor.stars) || 0;

        await proveedor.update({ stars, level, color, approval_rate, defect_rate, total_deliveries: total });

        return {
            id: proveedor_id,
            stars_anterior,
            stars,
            level,
            color,
            approval_rate,
            defect_rate,
            total_deliveries: total
        };
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