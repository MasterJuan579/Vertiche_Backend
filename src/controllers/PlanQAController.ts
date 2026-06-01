/* ============================================================================
 * Archivo: PlanQAController.ts
 * Descripción: Controller para el plan de inspección QA. Calcula cuántos
 *              prepacks revisar por proveedor según su calificación (stars).
 *              Incluye endpoint de escaneo para decidir si se revisa o no.
 *              Reglas:
 *                stars >= 4.5 → cuota = 3
 *                stars >= 3.0 → cuota = 5
 *                stars < 3.0  → cuota = 7
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";
import { Op } from "sequelize";

export default class PlanQAController extends AbstractController {
    // Singleton
    private static _instance: PlanQAController;
    public static get instance(): PlanQAController {
        return this._instance || (this._instance = new this("PlanQA"));
    }

    protected initRoutes(): void {
        this.router.get('/pendientes', this.getPendientes.bind(this));
        this.router.post('/escanear', this.postEscanear.bind(this));
    }

    private calcularCuota(stars: number): number {
        if (stars >= 4.5) return 3;
        if (stars >= 3.0) return 5;
        return 7;
    }

    private getRangoHoy(): { hoy: Date; manana: Date } {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const manana = new Date(hoy);
        manana.setDate(manana.getDate() + 1);
        return { hoy, manana };
    }

    private async getPendientes(req: Request, res: Response): Promise<void> {
        try {
            const proveedores = await db.Proveedor.findAll({
                attributes: ['id', 'nombre', 'codigo', 'stars', 'level', 'color', 'origin']
            });

            const { hoy, manana } = this.getRangoHoy();
            const resultado = [];

            for (const prov of proveedores) {
                const stars = parseFloat(prov.stars) || 0;
                const cuota = this.calcularCuota(stars);

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

    private async postEscanear(req: Request, res: Response): Promise<void> {
        try {
            const { epc } = req.body;

            if (!epc) {
                res.status(400).json({ message: "El campo epc es requerido" });
                return;
            }

            // 1. Buscar el Tag por EPC
            const tag = await db.Tag.findByPk(epc);
            if (!tag) {
                res.status(404).json({ message: "Tag no encontrado", epc: epc });
                return;
            }

            // 2. Buscar el proveedor
            const proveedor = await db.Proveedor.findByPk(tag.proveedor_id);
            if (!proveedor) {
                res.status(404).json({ message: "Proveedor no encontrado" });
                return;
            }

            // 3. Calcular cuota y restantes
            const stars = parseFloat(proveedor.stars) || 0;
            const cuota = this.calcularCuota(stars);
            const { hoy, manana } = this.getRangoHoy();

            const inspeccionadosHoy = await db.InspeccionQA.count({
                where: {
                    proveedor_id: proveedor.id,
                    fecha: {
                        [Op.gte]: hoy,
                        [Op.lt]: manana
                    }
                }
            });

            const restantes = Math.max(0, cuota - inspeccionadosHoy);

            // 4. Decidir acción: REVISAR o PASA
            if (restantes > 0) {
                res.status(200).json({
                    accion: "REVISAR",
                    epc: epc,
                    sku: tag.sku,
                    talla: tag.talla,
                    color: tag.color,
                    proveedor_id: proveedor.id,
                    proveedor_nombre: proveedor.nombre,
                    proveedor_codigo: proveedor.codigo,
                    stars: stars,
                    level: proveedor.level,
                    cuota: cuota,
                    inspeccionados_hoy: inspeccionadosHoy,
                    restantes_antes: restantes,
                    restantes_despues: restantes - 1
                });
            } else {
                res.status(200).json({
                    accion: "PASA",
                    epc: epc,
                    sku: tag.sku,
                    talla: tag.talla,
                    color: tag.color,
                    proveedor_id: proveedor.id,
                    proveedor_nombre: proveedor.nombre,
                    proveedor_codigo: proveedor.codigo,
                    stars: stars,
                    level: proveedor.level,
                    cuota: cuota,
                    inspeccionados_hoy: inspeccionadosHoy,
                    restantes: 0,
                    mensaje: "Cuota de inspección completada, prepack pasa directo"
                });
            }
        } catch (err) {
            console.log(err);
            res.status(500).json({ error: "error_interno", message: (err as Error).message });
        }
    }
}
