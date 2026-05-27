/* ============================================================================
 * Archivo: TagController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad Tag (prepack RFID).
 *              Entidad central del sistema: listar y crear tags.
 * ============================================================================ */
import { Request, Response } from "express";
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
        this.router.get('/listarTags',
            this.getListarTags.bind(this));
        this.router.post('/crearTag',
            this.postCrearTag.bind(this));
        this.router.get('/:id', this.getTagPorId.bind(this));
        this.router.put('/:id', this.putActualizarTag.bind(this));
        this.router.delete('/:id', this.deleteTag.bind(this));
    }

    // ============================================
    // GET /Tag/listarTags - MODIFICADO
    // Ahora incluye Tienda y Proveedor como objetos completos
    // ============================================
    private async getListarTags(req: Request, res: Response): Promise<void> {
        try {
            const tags = await db.Tag.findAll({
                include: [
                    { 
                        model: db.Tienda,
                        attributes: ['tienda_id', 'nombre', 'ciudad', 'bahia_asignada']
                    },
                    { 
                        model: db.Proveedor,
                        attributes: ['id', 'nombre', 'codigo']
                    }
                ]
            });
            
            const resultado = tags.map((tag: any) => ({
                epc: tag.epc,
                sku: tag.sku,
                talla: tag.talla,
                color: tag.color,
                cantidad_piezas: tag.cantidad_piezas,
                proveedor_id: tag.proveedor_id,
                tienda_id: tag.tienda_id,
                etapa_actual: tag.etapa_actual,
                qa_fallido: tag.qa_fallido,
                tipo_flujo: tag.tipo_flujo,
                registrado_en: tag.registrado_en,
                proveedor: tag.Proveedor,
                tienda: tag.Tienda,
                prendas: [{ color: tag.color, talla: tag.talla, cantidad: tag.cantidad_piezas }],
                createdAt: tag.createdAt,
                updatedAt: tag.updatedAt
            }));
            
            res.status(200).json(resultado);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    // ============================================
    // POST /Tag/crearTag
    // ============================================
    private async postCrearTag(req: Request, res: Response): Promise<void> {
        try {
            console.log(req.body);
            await db['Tag'].create(req.body);
            res.status(200).json({ message: "Registro de tag exitoso" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    // ============================================
    // GET /Tag/:id - MODIFICADO
    // Ahora incluye Tienda, Proveedor, Eventos y Anomalías
    // ============================================
    private async getTagPorId(req: Request, res: Response): Promise<void> {
        try {
            const tag = await db.Tag.findByPk(req.params.id, {
                include: [
                    { model: db.Tienda },
                    { model: db.Proveedor },
                    { 
                        model: db.EventoLectura,
                        limit: 50,
                        order: [['timestamp', 'DESC']]
                    },
                    { 
                        model: db.Anomalia,
                        where: { resuelto: false },
                        required: false
                    }
                ]
            });
            
            if (!tag) {
                res.status(404).json({ message: "Tag no encontrado" });
                return;
            }
            
            const resultado = {
                epc: tag.epc,
                sku: tag.sku,
                talla: tag.talla,
                color: tag.color,
                cantidad_piezas: tag.cantidad_piezas,
                proveedor_id: tag.proveedor_id,
                tienda_id: tag.tienda_id,
                etapa_actual: tag.etapa_actual,
                qa_fallido: tag.qa_fallido,
                tipo_flujo: tag.tipo_flujo,
                registrado_en: tag.registrado_en,
                proveedor: tag.Proveedor,
                tienda: tag.Tienda,
                prendas: [{ color: tag.color, talla: tag.talla, cantidad: tag.cantidad_piezas }],
                ultimas_lecturas: tag.EventoLecturas,
                anomalias_pendientes: tag.Anomalias,
                createdAt: tag.createdAt,
                updatedAt: tag.updatedAt
            };
            
            res.status(200).json(resultado);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    // ============================================
    // PUT /Tag/:id
    // ============================================
    private async putActualizarTag(req: Request, res: Response): Promise<void> {
        try {
            const tag = await db.Tag.findByPk(req.params.id);
            if (!tag) { 
                res.status(404).json({ message: "Tag no encontrado" }); 
                return; 
            }
            await tag.update(req.body);
            res.status(200).json({ message: "Tag actualizado exitosamente" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    // ============================================
    // DELETE /Tag/:id
    // ============================================
    private async deleteTag(req: Request, res: Response): Promise<void> {
        try {
            const tag = await db.Tag.findByPk(req.params.id);
            if (!tag) { 
                res.status(404).json({ message: "Tag no encontrado" }); 
                return; 
            }
            await tag.destroy();
            res.status(200).json({ message: "Tag eliminado exitosamente" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
}