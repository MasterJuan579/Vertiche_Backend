/* ============================================================================
 * Archivo: PlanQAController.ts
 * Descripción: Controller para el plan de inspección QA.
 *              Cuota de inspección = porcentaje de prepacks del día según nivel.
 *
 *              ELITE (stars >= 4.5) → 10% de prepacks del día (mínimo 1)
 *              MEDIA (stars >= 3.0) → 35% de prepacks del día (mínimo 2)
 *              BAJA  (stars < 3.0)  → 70% de prepacks del día (mínimo 3)
 *
 *              Si no hay prepacks registrados hoy, usa fallback: 3, 5, 7.
 *              Emite evento Socket.IO 'qa-escaneo' al escanear.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";
import { Op } from "sequelize";
import { emit } from "../realtime/socketIo";

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

    private getRangoHoy(): { hoy: Date; manana: Date } {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const manana = new Date(hoy);
        manana.setDate(manana.getDate() + 1);
        return { hoy, manana };
    }

    /**
     * Calcula cuota de inspección basada en porcentaje de prepacks del día.
     * @param stars - calificación del proveedor
     * @param totalPrepacksHoy - prepacks registrados hoy para ese proveedor
     * @returns cuota de inspección
     */
    private calcularCuota(stars: number, totalPrepacksHoy: number): number {
        let porcentaje: number;
        let minimo: number;
        let fallback: number;

        if (stars >= 4.5) {
            porcentaje = 0.10;
            minimo = 1;
            fallback = 3;
        } else if (stars >= 3.0) {
            porcentaje = 0.35;
            minimo = 2;
            fallback = 5;
        } else {
            porcentaje = 0.70;
            minimo = 3;
            fallback = 7;
        }

        // Si no hay prepacks hoy, usar fallback
        if (totalPrepacksHoy === 0) return fallback;

        // Calcular porcentaje, respetar mínimo
        return Math.max(minimo, Math.ceil(totalPrepacksHoy * porcentaje));
    }

    /**
     * Cuenta prepacks (Tags) registrados hoy para un proveedor
     */
    private async contarPrepacksHoy(proveedorId: number, hoy: Date, manana: Date): Promise<number> {
        return await db.Tag.count({
            where: {
                proveedor_id: proveedorId,
                registrado_en: {
                    [Op.gte]: hoy,
                    [Op.lt]: manana
                }
            }
        });
    }

    /**
     * GET /PlanQA/pendientes
     * Devuelve la lista de proveedores con cuota, inspeccionados hoy y restantes
     */
    private async getPendientes(req: Request, res: Response): Promise<void> {
        try {
            const proveedores = await db.Proveedor.findAll({
                attributes: ['id', 'nombre', 'codigo', 'stars', 'level', 'color', 'origin']
            });

            const { hoy, manana } = this.getRangoHoy();
            const resultado = [];

            for (const prov of proveedores) {
                const stars = parseFloat(prov.stars) || 0;

                // Contar prepacks de hoy para este proveedor
                const totalPrepacksHoy = await this.contarPrepacksHoy(prov.id, hoy, manana);

                // Calcular cuota basada en porcentaje
                const cuota = this.calcularCuota(stars, totalPrepacksHoy);

                // Contar inspecciones de hoy
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
                    total_prepacks_hoy: totalPrepacksHoy,
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

    /**
     * POST /PlanQA/escanear
     * Recibe un EPC, identifica el proveedor, y decide si se debe revisar o pasa directo.
     */
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
            const { hoy, manana } = this.getRangoHoy();

            const totalPrepacksHoy = await this.contarPrepacksHoy(proveedor.id, hoy, manana);
            const cuota = this.calcularCuota(stars, totalPrepacksHoy);

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

            // 4. Decidir acción y armar respuesta
            let respuesta: any;

            if (restantes > 0) {
                respuesta = {
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
                    total_prepacks_hoy: totalPrepacksHoy,
                    cuota: cuota,
                    inspeccionados_hoy: inspeccionadosHoy,
                    restantes_antes: restantes,
                    restantes_despues: restantes - 1
                };
            } else {
                respuesta = {
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
                    total_prepacks_hoy: totalPrepacksHoy,
                    cuota: cuota,
                    inspeccionados_hoy: inspeccionadosHoy,
                    restantes: 0,
                    mensaje: "Cuota de inspección completada, prepack pasa directo"
                };
            }

            // 5. Emitir evento Socket.IO
            emit('qa-escaneo', respuesta);

            res.status(200).json(respuesta);
        } catch (err) {
            console.log(err);
            res.status(500).json({ error: "error_interno", message: (err as Error).message });
        }
    }
}
