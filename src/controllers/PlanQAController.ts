/* ============================================================================
 * Archivo: PlanQAController.ts
 * Descripción: Plan de inspección QA — cuota dinámica basada en rating y
 *              volumen de prepacks recibidos hoy.
 *
 *  LÓGICA DE MUESTREO (nueva)
 *  ─────────────────────────
 *  Nivel  | Rating    | % Muestreo | Tope máximo
 *  ELITE  | 4.5 – 5.0 |    15%     |  4 prepacks
 *  MEDIA  | 3.5 – 4.4 |    30%     |  8 prepacks
 *  BAJA   | 1.0 – 3.4 |    50%     | 12 prepacks
 *
 *  cuota = min( ceil(total_prepacks_hoy × sampling_rate), tope_máximo )
 *
 *  CONTRATO CON EL FRONTEND
 *  ────────────────────────
 *  POST /PlanQA/escanear
 *    Request:  { epc: string }
 *    Response: { decision: "REVISAR" | "PASA", proveedor_id, ... }
 *    El campo `accion` se mantiene por compatibilidad con el frontend actual.
 *
 *  GET /PlanQA/pendientes
 *    Response: [{ proveedor_id, nombre, codigo, stars, level, color, origin,
 *                 cuota, total_prepacks_hoy, inspeccionados_hoy, restantes }]
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";
import { Op } from "sequelize";
import { calcularCuota, getRangoHoy } from "../utils/qaUtils";

export default class PlanQAController extends AbstractController {
    private static _instance: PlanQAController;
    public static get instance(): PlanQAController {
        return this._instance || (this._instance = new this("PlanQA"));
    }

    protected initRoutes(): void {
        this.router.get('/pendientes', this.getPendientes.bind(this));
        this.router.post('/escanear',  this.postEscanear.bind(this));
    }

    // ── GET /pendientes ───────────────────────────────────────────────────────
    private async getPendientes(_req: Request, res: Response): Promise<void> {
        try {
            const { hoy, manana } = getRangoHoy();

            const proveedores = await db.Proveedor.findAll({
                attributes: ['id', 'nombre', 'codigo', 'stars', 'level', 'color', 'origin']
            });

            const resultado = [];

            for (const prov of proveedores) {
                const stars = parseFloat(prov.stars) || 0;

                // Total de prepacks de este proveedor registrados hoy
                const totalHoy: number = await db.Tag.count({
                    where: {
                        proveedor_id: prov.id,
                        registrado_en: { [Op.gte]: hoy, [Op.lt]: manana }
                    }
                });

                const cuota = calcularCuota(stars, totalHoy);

                const inspeccionadosHoy: number = await db.InspeccionQA.count({
                    where: {
                        proveedor_id: prov.id,
                        fecha: { [Op.gte]: hoy, [Op.lt]: manana }
                    }
                });

                const restantes = Math.max(0, cuota - inspeccionadosHoy);

                resultado.push({
                    proveedor_id:        prov.id,
                    nombre:              prov.nombre,
                    codigo:              prov.codigo,
                    stars,
                    level:               prov.level,
                    color:               prov.color,
                    origin:              prov.origin,
                    cuota,
                    total_prepacks_hoy:  totalHoy,
                    inspeccionados_hoy:  inspeccionadosHoy,
                    restantes
                });
            }

            res.status(200).json(resultado);
        } catch (err) {
            console.error('[PlanQAController.getPendientes]', err);
            res.status(500).json({ error: 'error_interno', message: (err as Error).message });
        }
    }

    // ── POST /escanear ────────────────────────────────────────────────────────
    private async postEscanear(req: Request, res: Response): Promise<void> {
        try {
            const { epc } = req.body;

            if (!epc) {
                res.status(400).json({ message: 'El campo epc es requerido' });
                return;
            }

            const tag = await db.Tag.findByPk(epc);
            if (!tag) {
                res.status(404).json({ message: 'Tag no encontrado', epc });
                return;
            }

            const proveedor = await db.Proveedor.findByPk(tag.proveedor_id);
            if (!proveedor) {
                res.status(404).json({ message: 'Proveedor no encontrado' });
                return;
            }

            const stars = parseFloat(proveedor.stars) || 0;
            const { hoy, manana } = getRangoHoy();

            // Total de prepacks del proveedor registrados hoy (igual que pendientes)
            const totalHoy: number = await db.Tag.count({
                where: {
                    proveedor_id: proveedor.id,
                    registrado_en: { [Op.gte]: hoy, [Op.lt]: manana }
                }
            });

            const cuota = calcularCuota(stars, totalHoy);

            const inspeccionadosHoy: number = await db.InspeccionQA.count({
                where: {
                    proveedor_id: proveedor.id,
                    fecha: { [Op.gte]: hoy, [Op.lt]: manana }
                }
            });

            const restantes = Math.max(0, cuota - inspeccionadosHoy);
            const decision   = restantes > 0 ? 'REVISAR' : 'PASA';

            const base = {
                decision,
                accion: decision,          // campo legacy para compatibilidad
                epc,
                sku:              tag.sku,
                talla:            tag.talla,
                color:            tag.color,
                proveedor_id:     proveedor.id,
                proveedor_nombre: proveedor.nombre,
                proveedor_codigo: proveedor.codigo,
                stars,
                level:            proveedor.level,
                cuota,
                total_prepacks_hoy: totalHoy,
                inspeccionados_hoy: inspeccionadosHoy
            };

            if (decision === 'REVISAR') {
                res.status(200).json({
                    ...base,
                    restantes_antes:  restantes,
                    restantes_despues: restantes - 1
                });
            } else {
                res.status(200).json({
                    ...base,
                    restantes: 0,
                    mensaje: 'Cuota de inspección completada para este proveedor hoy'
                });
            }
        } catch (err) {
            console.error('[PlanQAController.postEscanear]', err);
            res.status(500).json({ error: 'error_interno', message: (err as Error).message });
        }
    }
}