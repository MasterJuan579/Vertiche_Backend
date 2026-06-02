/* ============================================================================
 * Archivo: ProveedorController.ts
 * Descripción: CRUD de proveedores + endpoint de perfil enriquecido.
 *
 *  GET /Proveedor/listarProveedores    — lista ordenada por stars DESC
 *  GET /Proveedor/:id/perfil           — perfil completo para PerfilProveedor.jsx
 *  GET /Proveedor/:id                  — datos base del proveedor
 *  POST /Proveedor/crearProveedor      — crear proveedor
 *  PUT  /Proveedor/:id                 — actualizar proveedor
 *  DELETE /Proveedor/:id               — eliminar proveedor
 *
 *  ENDPOINT /perfil — campos devueltos:
 *    · Info base: id, nombre, codigo, stars, level, color, origin
 *    · Info comercial: rfc, contact, phone, email, address, category,
 *                      since, paymentTerms
 *    · KPIs calculados:
 *        deliveries  — inspecciones YTD (año en curso)
 *        approval    — proveedor.approval_rate (calculado por InspeccionQAController)
 *        defects     — count OBSERVADO + RECHAZADO en historial total
 *        leadtime    — proveedor.avg_leadtime
 *    · sparkData — últimas 12 notas de revisión (score), null como padding izquierdo
 *    · history   — últimas 10 inspecciones con dato de Tag incluido
 *        resultado mapeado a: APROBADO → "ok" | OBSERVADO → "warn" | RECHAZADO → "fail"
 * ============================================================================ */
import { Request, Response } from "express";
import { Op } from "sequelize";
import AbstractController from "./AbstractController";
import db from "../models";

const RESULTADO_MAP: Record<string, string> = {
    APROBADO:  'ok',
    OBSERVADO: 'warn',
    RECHAZADO: 'fail'
};

export default class ProveedorController extends AbstractController {
    private static _instance: ProveedorController;
    public static get instance(): ProveedorController {
        return this._instance || (this._instance = new this("Proveedor"));
    }

    protected initRoutes(): void {
        this.router.get('/listarProveedores', this.getListarProveedores.bind(this));
        this.router.post('/crearProveedor',   this.postCrearProveedor.bind(this));
        this.router.get('/:id/perfil',        this.getPerfilProveedor.bind(this));
        this.router.get('/:id',               this.getProveedorPorId.bind(this));
        this.router.put('/:id',               this.putActualizarProveedor.bind(this));
        this.router.delete('/:id',            this.deleteProveedor.bind(this));
    }

    // ── GET /listarProveedores — ranking por stars DESC ───────────────────────
    private async getListarProveedores(_req: Request, res: Response): Promise<void> {
        try {
            const proveedores = await db.Proveedor.findAll({
                order: [['stars', 'DESC']]
            });
            res.status(200).json(proveedores);
        } catch (err: any) {
            console.error('[ProveedorController.listarProveedores]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // ── POST /crearProveedor ──────────────────────────────────────────────────
    private async postCrearProveedor(req: Request, res: Response): Promise<void> {
        try {
            await db['Proveedor'].create(req.body);
            res.status(200).json({ message: "Registro de proveedor exitoso" });
        } catch (err: any) {
            console.error('[ProveedorController.crearProveedor]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // ── GET /:id/perfil ───────────────────────────────────────────────────────
    private async getPerfilProveedor(req: Request, res: Response): Promise<void> {
        try {
            const proveedor: any = await db.Proveedor.findByPk(req.params['id']);
            if (!proveedor) {
                res.status(404).json({ error: 'no_encontrado', message: 'Proveedor no encontrado' });
                return;
            }

            const inicioAnio = new Date(new Date().getFullYear(), 0, 1);

            // Queries paralelas para rendimiento
            const [deliveries, defects, last12Raw, historialRaw] = await Promise.all([
                // Inspecciones del año en curso (proxy de entregas YTD)
                db.InspeccionQA.count({
                    where: {
                        proveedor_id: proveedor.id,
                        fecha: { [Op.gte]: inicioAnio }
                    }
                }),
                // Total de prepacks con defecto (OBSERVADO o RECHAZADO) en historial
                db.InspeccionQA.count({
                    where: {
                        proveedor_id: proveedor.id,
                        resultado: { [Op.in]: ['OBSERVADO', 'RECHAZADO'] }
                    }
                }),
                // Últimas 12 notas para sparkline
                db.InspeccionQA.findAll({
                    where: { proveedor_id: proveedor.id },
                    order: [['fecha', 'DESC']],
                    limit: 12,
                    attributes: ['score'],
                    raw: true
                }),
                // Últimas 10 inspecciones con datos del Tag
                db.InspeccionQA.findAll({
                    where: { proveedor_id: proveedor.id },
                    order: [['fecha', 'DESC']],
                    limit: 10,
                    include: [{
                        model: db.Tag,
                        attributes: ['sku', 'talla', 'cantidad_piezas', 'pedido_id']
                    }]
                })
            ]);

            // sparkData: orden cronológico (ASC), padding de nulls a la izquierda
            const scores = (last12Raw as any[])
                .reverse()
                .map((i: any) => parseFloat(i.score));
            const sparkData: (number | null)[] = Array(Math.max(0, 12 - scores.length))
                .fill(null)
                .concat(scores);

            // history: mapeo de resultado y formato de fecha DD/MM/YYYY
            const history = (historialRaw as any[]).map((ins: any) => {
                const tag = ins.Tag;
                const d = new Date(ins.fecha);
                const dd   = ('0' + d.getDate()).slice(-2);
                const mm   = ('0' + (d.getMonth() + 1)).slice(-2);
                const date = `${dd}/${mm}/${d.getFullYear()}`;
                const po   = tag?.pedido_id ?? ins.tag_epc.slice(-6);
                const desc = tag
                    ? `${tag.sku}${tag.talla ? ' ' + tag.talla : ''} · ${tag.cantidad_piezas} pz`
                    : ins.tag_epc;
                return {
                    date,
                    po,
                    desc,
                    resultado: RESULTADO_MAP[ins.resultado] ?? 'ok',
                    note: ins.observacion ?? null
                };
            });

            res.status(200).json({
                // Info base
                id:     proveedor.id,
                nombre: proveedor.nombre,
                codigo: proveedor.codigo,
                stars:  parseFloat(proveedor.stars) || 0,
                level:  proveedor.level,
                color:  proveedor.color,
                origin: proveedor.origin,

                // Info comercial
                rfc:          proveedor.rfc,
                contact:      proveedor.contacto,
                phone:        proveedor.phone,
                email:        proveedor.email,
                address:      proveedor.address,
                category:     proveedor.category,
                since:        proveedor.since_date,
                paymentTerms: proveedor.payment_terms,

                // KPIs
                deliveries,
                approval: proveedor.approval_rate ?? 0,
                defects,
                leadtime: proveedor.avg_leadtime ?? 0,

                // Visualización
                sparkData,
                history
            });
        } catch (err: any) {
            console.error('[ProveedorController.getPerfilProveedor]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // ── GET /:id ──────────────────────────────────────────────────────────────
    private async getProveedorPorId(req: Request, res: Response): Promise<void> {
        try {
            const proveedor = await db.Proveedor.findByPk(req.params['id']);
            if (!proveedor) {
                res.status(404).json({ error: 'no_encontrado', message: "Proveedor no encontrado" });
                return;
            }
            res.status(200).json(proveedor);
        } catch (err: any) {
            console.error('[ProveedorController.getProveedorPorId]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // ── PUT /:id ──────────────────────────────────────────────────────────────
    private async putActualizarProveedor(req: Request, res: Response): Promise<void> {
        try {
            const proveedor = await db.Proveedor.findByPk(req.params['id']);
            if (!proveedor) {
                res.status(404).json({ error: 'no_encontrado', message: "Proveedor no encontrado" });
                return;
            }
            await proveedor.update(req.body);
            res.status(200).json({ message: "Proveedor actualizado exitosamente" });
        } catch (err: any) {
            console.error('[ProveedorController.actualizarProveedor]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // ── DELETE /:id ───────────────────────────────────────────────────────────
    private async deleteProveedor(req: Request, res: Response): Promise<void> {
        try {
            const proveedor = await db.Proveedor.findByPk(req.params['id']);
            if (!proveedor) {
                res.status(404).json({ error: 'no_encontrado', message: "Proveedor no encontrado" });
                return;
            }
            await proveedor.destroy();
            res.status(200).json({ message: "Proveedor eliminado exitosamente" });
        } catch (err: any) {
            console.error('[ProveedorController.deleteProveedor]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }
}