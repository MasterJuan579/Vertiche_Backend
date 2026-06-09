/* ============================================================================
 * Archivo: TurnoController.ts
 * Descripción: KPIs del turno en curso (scope = día de hoy).
 *
 *  GET /Turno/resumen
 *    totalSO   — Pedidos distintos con Tags registrados hoy (llegadas físicas)
 *    inspected — Prepacks inspeccionados hoy (InspeccionQA.fecha = hoy)
 *    rejected  — Inspecciones con resultado = RECHAZADO hoy
 *
 *  El frontend calcula avgStars localmente sobre /Proveedor/listarProveedores.
 * ============================================================================ */
import { Request, Response } from "express";
import { Op } from "sequelize";
import AbstractController from "./AbstractController";
import db from "../models";
import { verifyToken } from "../middleware/verifyToken";
import { getRangoHoy } from "../utils/qaUtils";

export default class TurnoController extends AbstractController {
    private static _instance: TurnoController;
    public static get instance(): TurnoController {
        return this._instance || (this._instance = new this("Turno"));
    }

    protected initRoutes(): void {
        this.router.use(verifyToken);
        this.router.get('/resumen', this.getResumen.bind(this));
    }

    private async getResumen(_req: Request, res: Response): Promise<void> {
        try {
            const { hoy, manana } = getRangoHoy();

            const [totalSO, inspected, rejected] = await Promise.all([
                // Pedidos distintos cuyas etiquetas llegaron hoy
                db.Tag.count({
                    where: {
                        registrado_en: { [Op.gte]: hoy, [Op.lt]: manana },
                        pedido_id:     { [Op.ne]: null }
                    },
                    distinct: true,
                    col: 'pedido_id'
                }),
                // Total de prepacks inspeccionados hoy
                db.InspeccionQA.count({
                    where: { fecha: { [Op.gte]: hoy, [Op.lt]: manana } }
                }),
                // Rechazos del turno
                db.InspeccionQA.count({
                    where: {
                        fecha:     { [Op.gte]: hoy, [Op.lt]: manana },
                        resultado: 'RECHAZADO'
                    }
                })
            ]);

            res.status(200).json({ totalSO, inspected, rejected });
        } catch (err: any) {
            console.error('[TurnoController.getResumen]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }
}