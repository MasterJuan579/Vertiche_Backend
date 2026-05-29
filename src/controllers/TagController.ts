/* ============================================================================
 * Archivo: TagController.ts
 * ──────────────────────────────────────────────────────────────────────────
 *  CONTROLLER COMPARTIDO con cambios del MÓDULO RFID.
 *  Cambios añadidos por team-rfid (necesarios para Vinculación, Trazabilidad,
 *  FlujoCEDIS y el endpoint POST /rfid/lectura):
 *    - Validación FK (proveedor_id, tienda_id) antes de INSERT.
 *    - Manejo de UniqueConstraintError → 409 epc_duplicado.
 *    - Include de Palet con orden_id (FlujoCEDIS lo necesita para el Gantt).
 *    - GET /Tag/buscarSku/:sku (Trazabilidad búsqueda por SKU).
 *    - Helper serializarTag() para shape consistente.
 *  Si tu equipo necesita modificar la respuesta, avisa a team-rfid antes —
 *  el shape lo consumen FlujoCEDIS, Trazabilidad y Vinculación.
 *  Ver docs/RFID_MODULE.md.
 * ──────────────────────────────────────────────────────────────────────────
 * Generado originalmente por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad Tag (prepack RFID).
 *              Entidad central del sistema: listar, crear, actualizar, eliminar
 *              y consultar tags. Validación reforzada para el módulo RFID.
 * ============================================================================ */
import { Request, Response } from "express";
import { Op, ValidationError, UniqueConstraintError, ForeignKeyConstraintError } from "sequelize";
import AbstractController from "./AbstractController";
import db from "../models";

export default class TagController extends AbstractController {
    //Singleton
    private static _instance: TagController;
    public static get instance(): TagController {
        return this._instance ||
            (this._instance = new this("Tag"));
    }

    protected initRoutes(): void {
        this.router.get('/listarTags', this.getListarTags.bind(this));
        this.router.post('/crearTag', this.postCrearTag.bind(this));
        this.router.get('/buscarSku/:sku', this.getBuscarPorSku.bind(this));
        this.router.get('/:id', this.getTagPorId.bind(this));
        this.router.put('/:id', this.putActualizarTag.bind(this));
        this.router.delete('/:id', this.deleteTag.bind(this));
    }

    // ============================================
    // GET /Tag/listarTags
    // Query params opcionales:
    //   ?limit=10            → máximo de resultados
    //   ?order=registrado_en:desc   → orden (campo:asc|desc)
    // Devuelve cada tag con Proveedor + Tienda + Palet (orden_id).
    // ============================================
    private async getListarTags(req: Request, res: Response): Promise<void> {
        try {
            const limitRaw = req.query['limit'] as string | undefined;
            const orderRaw = req.query['order'] as string | undefined;

            const findOptions: any = {
                include: [
                    {
                        model: db.Tienda,
                        attributes: ['tienda_id', 'nombre', 'ciudad', 'bahia_asignada']
                    },
                    {
                        model: db.Proveedor,
                        attributes: ['id', 'nombre', 'codigo']
                    },
                    {
                        model: db.Palet,
                        attributes: ['palet_id', 'orden_id'],
                        required: false
                    }
                ]
            };

            if (limitRaw) {
                const parsed = parseInt(limitRaw, 10);
                if (!isNaN(parsed) && parsed > 0) findOptions.limit = parsed;
            }

            if (orderRaw) {
                const [campo, dir] = orderRaw.split(':');
                const direccion = (dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
                const camposPermitidos = ['registrado_en', 'createdAt', 'updatedAt', 'epc', 'sku'];
                if (campo && camposPermitidos.includes(campo)) {
                    findOptions.order = [[campo, direccion]];
                }
            }

            const tags = await db.Tag.findAll(findOptions);
            const resultado = tags.map((tag: any) => this.serializarTag(tag));
            res.status(200).json(resultado);
        } catch (err: any) {
            console.error('[TagController.listarTags]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al listar tags' });
        }
    }

    // ============================================
    // POST /Tag/crearTag
    // Valida campos requeridos, FKs y unicidad de EPC.
    // ============================================
    private async postCrearTag(req: Request, res: Response): Promise<void> {
        try {
            const body = req.body || {};

            // Normalización
            const epc = typeof body.epc === 'string' ? body.epc.trim() : body.epc;
            const sku = typeof body.sku === 'string' ? body.sku.trim() : body.sku;
            const proveedor_id = body.proveedor_id;
            const tienda_id = typeof body.tienda_id === 'string' ? body.tienda_id.trim() : body.tienda_id;

            // Validación de campos requeridos
            const faltantes: string[] = [];
            if (!epc) faltantes.push('epc');
            if (!sku) faltantes.push('sku');
            if (proveedor_id === undefined || proveedor_id === null || proveedor_id === '') faltantes.push('proveedor_id');
            if (!tienda_id) faltantes.push('tienda_id');

            if (faltantes.length > 0) {
                res.status(400).json({
                    error: 'campos_requeridos',
                    message: `Faltan campos requeridos: ${faltantes.join(', ')}`,
                    detalle: faltantes
                });
                return;
            }

            // Verificación de FKs antes de insertar
            const proveedor = await db.Proveedor.findByPk(proveedor_id);
            if (!proveedor) {
                res.status(400).json({
                    error: 'fk_invalida',
                    message: `Proveedor con id ${proveedor_id} no existe`,
                    detalle: 'proveedor_id'
                });
                return;
            }

            const tienda = await db.Tienda.findByPk(tienda_id);
            if (!tienda) {
                res.status(400).json({
                    error: 'fk_invalida',
                    message: `Tienda ${tienda_id} no existe`,
                    detalle: 'tienda_id'
                });
                return;
            }

            // Payload final (defaults para timestamps)
            const payload = {
                ...body,
                epc,
                sku,
                proveedor_id,
                tienda_id,
                registrado_en: body.registrado_en || new Date()
            };

            const created: any = await db.Tag.create(payload);

            // Refetch con relaciones para devolver shape consistente
            const tagConRelaciones: any = await db.Tag.findByPk(created.epc, {
                include: [
                    { model: db.Tienda, attributes: ['tienda_id', 'nombre', 'ciudad', 'bahia_asignada'] },
                    { model: db.Proveedor, attributes: ['id', 'nombre', 'codigo'] },
                    { model: db.Palet, attributes: ['palet_id', 'orden_id'], required: false }
                ]
            });

            res.status(201).json({
                message: 'Tag registrado correctamente',
                tag: this.serializarTag(tagConRelaciones)
            });
        } catch (err: any) {
            if (err instanceof UniqueConstraintError) {
                res.status(409).json({
                    error: 'epc_duplicado',
                    message: 'Ya existe un tag con ese EPC',
                    detalle: err.errors?.map(e => e.path).filter(Boolean) || ['epc']
                });
                return;
            }
            if (err instanceof ForeignKeyConstraintError) {
                res.status(400).json({
                    error: 'fk_invalida',
                    message: 'Una referencia (proveedor, tienda, palet o pedido) no existe',
                    detalle: err.message
                });
                return;
            }
            if (err instanceof ValidationError) {
                res.status(400).json({
                    error: 'validacion',
                    message: err.errors?.map(e => e.message).join('; ') || 'Datos inválidos',
                    detalle: err.errors?.map(e => ({ campo: e.path, mensaje: e.message }))
                });
                return;
            }
            console.error('[TagController.crearTag]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al crear tag' });
        }
    }

    // ============================================
    // GET /Tag/buscarSku/:sku
    // Búsqueda por coincidencia parcial en SKU (insensible a mayúsculas).
    // ============================================
    private async getBuscarPorSku(req: Request, res: Response): Promise<void> {
        try {
            const skuRaw = req.params['sku'];
            const sku = (typeof skuRaw === 'string' ? skuRaw : '').trim();
            if (!sku) {
                res.status(400).json({ error: 'sku_requerido', message: 'Debe especificar un SKU' });
                return;
            }

            const tags = await db.Tag.findAll({
                where: { sku: { [Op.like]: `%${sku}%` } },
                include: [
                    { model: db.Tienda, attributes: ['tienda_id', 'nombre', 'ciudad', 'bahia_asignada'] },
                    { model: db.Proveedor, attributes: ['id', 'nombre', 'codigo'] },
                    { model: db.Palet, attributes: ['palet_id', 'orden_id'], required: false }
                ]
            });

            res.status(200).json(tags.map((t: any) => this.serializarTag(t)));
        } catch (err: any) {
            console.error('[TagController.buscarPorSku]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al buscar por SKU' });
        }
    }

    // ============================================
    // GET /Tag/:id
    // Tag completo + Tienda + Proveedor + 50 últimas lecturas + anomalías abiertas.
    // ============================================
    private async getTagPorId(req: Request, res: Response): Promise<void> {
        try {
            const epc = req.params['id'];

            // Tag + relaciones simples
            const tag: any = await db.Tag.findByPk(epc, {
                include: [
                    { model: db.Tienda },
                    { model: db.Proveedor },
                    { model: db.Palet, attributes: ['palet_id', 'orden_id'], required: false },
                ]
            });

            if (!tag) {
                res.status(404).json({ error: 'no_encontrado', message: 'Tag no encontrado' });
                return;
            }

            // Queries separadas para evitar conflictos limit/where/order entre includes
            const [lecturas, anomalias] = await Promise.all([
                db.EventoLectura.findAll({
                    where: { epc },
                    order: [['timestamp', 'DESC']],
                    limit: 50,
                }),
                db.Anomalia.findAll({
                    where: { epc, resuelto: false },
                    order: [['timestamp', 'DESC']],
                }),
            ]);

            res.status(200).json({
                ...this.serializarTag(tag),
                ultimas_lecturas: lecturas,
                anomalias_pendientes: anomalias,
            });
        } catch (err: any) {
            console.error('[TagController.getTagPorId]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al obtener tag' });
        }
    }

    // ============================================
    // PUT /Tag/:id
    // ============================================
    private async putActualizarTag(req: Request, res: Response): Promise<void> {
        try {
            const tag = await db.Tag.findByPk(req.params['id']);
            if (!tag) {
                res.status(404).json({ error: 'no_encontrado', message: 'Tag no encontrado' });
                return;
            }
            await tag.update(req.body);
            res.status(200).json({ message: 'Tag actualizado exitosamente' });
        } catch (err: any) {
            if (err instanceof ValidationError) {
                res.status(400).json({
                    error: 'validacion',
                    message: err.errors?.map(e => e.message).join('; ') || 'Datos inválidos'
                });
                return;
            }
            console.error('[TagController.actualizarTag]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al actualizar tag' });
        }
    }

    // ============================================
    // DELETE /Tag/:id
    // ============================================
    private async deleteTag(req: Request, res: Response): Promise<void> {
        try {
            const tag = await db.Tag.findByPk(req.params['id']);
            if (!tag) {
                res.status(404).json({ error: 'no_encontrado', message: 'Tag no encontrado' });
                return;
            }
            await tag.destroy();
            res.status(200).json({ message: 'Tag eliminado exitosamente' });
        } catch (err: any) {
            console.error('[TagController.deleteTag]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al eliminar tag' });
        }
    }

    // ============================================
    // Serialización compartida
    // ============================================
    private serializarTag(tag: any): any {
        if (!tag) return null;
        return {
            epc: tag.epc,
            sku: tag.sku,
            talla: tag.talla,
            color: tag.color,
            cantidad_piezas: tag.cantidad_piezas,
            proveedor_id: tag.proveedor_id,
            tienda_id: tag.tienda_id,
            palet_id: tag.palet_id,
            pedido_id: tag.pedido_id,
            orden_id: tag.Palet?.orden_id || null,
            tipo_flujo: tag.tipo_flujo,
            etapa_actual: tag.etapa_actual,
            qa_fallido: tag.qa_fallido,
            registrado_en: tag.registrado_en,
            proveedor: tag.Proveedor || null,
            tienda: tag.Tienda || null,
            palet: tag.Palet || null,
            prendas: [{ color: tag.color, talla: tag.talla, cantidad: tag.cantidad_piezas }],
            createdAt: tag.createdAt,
            updatedAt: tag.updatedAt
        };
    }
}
