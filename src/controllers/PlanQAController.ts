/* ============================================================================
 * Archivo: PlanQAController.ts
 * Descripción: Controller para el plan de inspección QA. Calcula cuántos
 *              prepacks revisar por proveedor según su calificación (stars).
 *              Reglas:
 *                stars >= 4.5 → cuota = 3
 *                stars >= 3.0 → cuota = 5
 *                stars < 3.0  → cuota = 7
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";
import { Op, fn, col, literal } from "sequelize";

export default class PlanQAController extends AbstractController {
    // Singleton
    private static _instance: PlanQAController;
    public static get instance(): PlanQAController {
        return this._instance || (this._instance = new this("PlanQA"));
    }

    protected initRoutes(): void {
        this.router.get('/pendientes', this.getPendientes.bind(this));
    }

    /**
     * GET /PlanQA/pendientes
     * Devuelve la lista de proveedores con:
     *   - cuota de inspección según stars
     *   - cantidad inspeccionada hoy
     *   - restantes
     */
    private async getPendientes(req: Request, res: Response): Promise<void> {
        try {
            // 1. Traer todos los proveedores
            const proveedores = await db.Proveedor.findAll({
                attributes: ['id', 'nombre', 'codigo', 'stars', 'level', 'color', 'origin']
            });

            // 2. Para cada proveedor, contar inspecciones de hoy
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const manana = new Date(hoy);
            manana.setDate(manana.getDate() + 1);

            const resultado = [];

            for (const prov of proveedores) {
                const stars = parseFloat(prov.stars) || 0;

                // Calcular cuota según estrellas
                let cuota: number;
                if (stars >= 4.5) {
                    cuota = 3;
                } else if (stars >= 3.0) {
                    cuota = 5;
                } else {
                    cuota = 7;
                }

                // Contar inspecciones de hoy para este proveedor
                const inspeccionadosHoy = await db.InspeccionQA.count({
                    where: {
                        proveedor_id: prov.id,
                        fecha: {
                            [Op.gte]: hoy,
                            [Op.lt]: manana
                        }
                    }
                });

                const restantes = Math.max(0, cuota - inspeccionadosHoy);

                resultado.push({
                    proveedor_id: prov.id,
                    nombre: prov.nombre,
                    codigo: prov.codigo,
                    stars: stars,
                    level: prov.level,
                    color: prov.color,
                    origin: prov.origin,
                    cuota: cuota,
                    inspeccionados_hoy: inspeccionadosHoy,
                    restantes: restantes
                });
            }

            res.status(200).json(resultado);
        } catch (err) {
            console.log(err);
            res.status(500).json({ error: "error_interno", message: (err as Error).message });
        }
    }
}
