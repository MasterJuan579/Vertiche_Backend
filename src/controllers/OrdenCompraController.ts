/* ============================================================================
 * Archivo: OrdenCompraController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad OrdenCompra. Listar y
 *              crear órdenes de compra (cabecera).
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

export default class OrdenCompraController extends AbstractController {
    //Singleton
    private static _instance: OrdenCompraController;
    public static get instance(): OrdenCompraController {
        return this._instance ||
            (this._instance = new this("OrdenCompra"));
    }
    
    protected initRoutes(): void {
        this.router.get('/listarOrdenes', this.getListarOrdenes.bind(this));
        this.router.post('/crearOrden', this.postCrearOrden.bind(this));
        this.router.get('/:id', this.getOrdenPorId.bind(this));
        this.router.put('/:id', this.putActualizarOrden.bind(this));
        this.router.delete('/:id', this.deleteOrden.bind(this));
    }

    // ============================================
    // GET /OrdenCompra/listarOrdenes
    // ============================================
    private async getListarOrdenes(req: Request, res: Response): Promise<void> {
        try {
            // Intentar incluir Tags si la asociación existe
            let includeConfig: any[] = [
                { 
                    model: db.Proveedor,
                    attributes: ['id', 'nombre', 'codigo']
                }
            ];
            
            // Verificar si la asociación Tag existe antes de incluirla
            try {
                // Esto es un intento - si falla, simplemente no incluimos Tags
                const testInclude = [
                    ...includeConfig,
                    {
                        model: db.Tag,
                        include: [{ model: db.Tienda }]
                    }
                ];
                
                const ordenesConTags = await db.OrdenCompra.findAll({
                    include: testInclude,
                    order: [['fecha_creacion', 'DESC']],
                    limit: 1
                });
                
                // Si llegamos aquí, la asociación existe
                includeConfig = testInclude;
            } catch (assocError) {
                console.log('⚠️ Asociación Tag-OrdenCompra no disponible, continuando sin Tags');
            }
            
            const ordenes = await db.OrdenCompra.findAll({
                include: includeConfig,
                order: [['fecha_creacion', 'DESC']]
            });
            
            const resultado = ordenes.map((orden: any) => {
                const tieneTags = orden.Tags !== undefined;
                const tags = orden.Tags || [];
                
                // Mapeo de etapas (solo si hay Tags)
                const mapeoEtapa: Record<string, string> = {
                    'REGISTRADO': 'PREREGISTRO',
                    'EN_QA': 'QA',
                    'APROBADO': 'SORTER',
                    'EN_CAJA': 'BAHIA',
                    'ENVIADO': 'ENVIO'
                };
                
                const ordenEtapas = ['PREREGISTRO', 'QA', 'REGISTRO', 'SORTER', 'BAHIA', 'AUDITORIA', 'ENVIO'];
                
                // Inicializar tagsPorEtapa (vacío si no hay Tags)
                const tagsPorEtapa: Record<string, any[]> = {
                    'PREREGISTRO': [], 'QA': [], 'REGISTRO': [], 
                    'SORTER': [], 'BAHIA': [], 'AUDITORIA': [], 'ENVIO': []
                };
                
                // Si hay Tags, agruparlos
                if (tieneTags && tags.length > 0) {
                    tags.forEach((tag: any) => {
                        const etapa = mapeoEtapa[tag.etapa_actual] || 'PREREGISTRO';
                        if (tagsPorEtapa[etapa]) {
                            tagsPorEtapa[etapa].push({
                                epc: tag.epc,
                                sku: tag.sku,
                                talla: tag.talla,
                                color: tag.color,
                                cantidad_piezas: tag.cantidad_piezas,
                                etapa_actual: tag.etapa_actual,
                                qa_fallido: tag.qa_fallido,
                                tienda: tag.Tienda,
                                prendas: [{ color: tag.color, talla: tag.talla, cantidad: tag.cantidad_piezas }]
                            });
                        }
                    });
                }
                
                // Etapas activas (donde hay al menos un tag)
                const etapasActivas = Object.entries(tagsPorEtapa)
                    .filter(([_, lista]) => lista.length > 0)
                    .map(([etapa]) => etapa);
                
                // Si no hay etapas activas pero la orden existe, poner al menos PREREGISTRO
                const etapasFinales = etapasActivas.length > 0 ? etapasActivas : ['PREREGISTRO'];
                const primeraEtapa = etapasFinales[0] ?? 'PREREGISTRO';
                const ultimaEtapa = etapasFinales[etapasFinales.length - 1] ?? 'PREREGISTRO';

                const idxMin = ordenEtapas.indexOf(primeraEtapa);
                const idxMax = ordenEtapas.indexOf(ultimaEtapa);
                
                return {
                    orden_id: orden.orden_id,
                    nombre_producto: orden.nombre_producto,
                    proveedor_id: orden.proveedor_id,
                    Proveedor: orden.Proveedor,
                    total_esperados: orden.total_esperados,
                    total_recibidos: orden.total_recibidos || 0,
                    estado: orden.estado,
                    faltantes: (orden.total_esperados || 0) - (orden.total_recibidos || 0),
                    pct: orden.total_esperados > 0 
                        ? ((orden.total_recibidos || 0) / orden.total_esperados) * 100 
                        : 0,
                    hasErr: tieneTags ? tags.some((t: any) => t.qa_fallido) : false,
                    etapasActivas: etapasFinales,
                    tagsPorEtapa,
                    idxMin: idxMin >= 0 ? idxMin : 0,
                    idxMax: idxMax >= 0 ? idxMax : 0,
                    tags: tieneTags ? tags.map((tag: any) => ({
                        epc: tag.epc,
                        sku: tag.sku,
                        talla: tag.talla,
                        color: tag.color,
                        cantidad_piezas: tag.cantidad_piezas,
                        etapa_actual: tag.etapa_actual,
                        qa_fallido: tag.qa_fallido,
                        tienda: tag.Tienda,
                        prendas: [{ color: tag.color, talla: tag.talla, cantidad: tag.cantidad_piezas }]
                    })) : [],
                    createdAt: orden.createdAt,
                    updatedAt: orden.updatedAt
                };
            });
            
            res.status(200).json(resultado);
        } catch (err) {
            console.log('Error en getListarOrdenes:', err);
            // Si todo falla, devolver al menos las órdenes básicas
            try {
                const ordenesBasicas = await db.OrdenCompra.findAll({
                    order: [['fecha_creacion', 'DESC']]
                });
                res.status(200).json(ordenesBasicas);
            } catch (fallbackErr) {
                res.status(500).json({ error: 'Error al obtener órdenes' });
            }
        }
    }

    // ============================================
    // GET /OrdenCompra/:id
    // ============================================
    private async getOrdenPorId(req: Request, res: Response): Promise<void> {
        try {
            // Intentar incluir Tags si la asociación existe
            let includeConfig: any[] = [{ model: db.Proveedor }];
            
            try {
                const testInclude = [
                    ...includeConfig,
                    {
                        model: db.Tag,
                        include: [
                            { model: db.Tienda },
                            { model: db.EventoLectura },
                            { model: db.Anomalia }
                        ]
                    }
                ];
                
                const testOrden = await db.OrdenCompra.findByPk(req.params.id, {
                    include: testInclude
                });
                
                if (testOrden !== null) {
                    includeConfig = testInclude;
                }
            } catch (assocError) {
                console.log('⚠️ Asociación Tag-OrdenCompra no disponible, continuando sin Tags');
            }
            
            const orden = await db.OrdenCompra.findByPk(req.params.id, {
                include: includeConfig
            });
            
            if (!orden) {
                res.status(404).json({ message: "Orden no encontrada" });
                return;
            }
            
            const tieneTags = (orden as any).Tags !== undefined;
            const tags = (orden as any).Tags || [];
            
            const mapeoEtapa: Record<string, string> = {
                'REGISTRADO': 'PREREGISTRO',
                'EN_QA': 'QA',
                'APROBADO': 'SORTER',
                'EN_CAJA': 'BAHIA',
                'ENVIADO': 'ENVIO'
            };
            
            const tagsPorEtapa: Record<string, any[]> = {
                'PREREGISTRO': [], 'QA': [], 'REGISTRO': [], 
                'SORTER': [], 'BAHIA': [], 'AUDITORIA': [], 'ENVIO': []
            };
            
            if (tieneTags && tags.length > 0) {
                tags.forEach((tag: any) => {
                    const etapa = mapeoEtapa[tag.etapa_actual] || 'PREREGISTRO';
                    if (tagsPorEtapa[etapa]) {
                        tagsPorEtapa[etapa].push({
                            ...tag.toJSON(),
                            prendas: [{ color: tag.color, talla: tag.talla, cantidad: tag.cantidad_piezas }]
                        });
                    }
                });
            }
            
            const resultado = {
                ...orden.toJSON(),
                tagsPorEtapa,
                tags: tieneTags ? tags.map((tag: any) => ({
                    ...tag.toJSON(),
                    prendas: [{ color: tag.color, talla: tag.talla, cantidad: tag.cantidad_piezas }],
                    ultimas_lecturas: tag.EventoLecturas,
                    anomalias_pendientes: tag.Anomalias
                })) : []
            };
            
            res.status(200).json(resultado);
        } catch (err) {
            console.log(err);
            // Fallback: devolver solo la orden básica
            try {
                const ordenBasica = await db.OrdenCompra.findByPk(req.params.id);
                if (!ordenBasica) {
                    res.status(404).json({ message: "Orden no encontrada" });
                    return;
                }
                res.status(200).json(ordenBasica);
            } catch (fallbackErr) {
                res.status(500).json({ error: 'Error al obtener la orden' });
            }
        }
    }

    // ============================================
    // POST /OrdenCompra/crearOrden
    // ============================================
    private async postCrearOrden(req: Request, res: Response): Promise<void> {
        try {
            console.log(req.body);
            await db['OrdenCompra'].create(req.body);
            res.status(200).json({ message: "Registro de orden de compra exitoso" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    // ============================================
    // PUT /OrdenCompra/:id
    // ============================================
    private async putActualizarOrden(req: Request, res: Response): Promise<void> {
        try {
            const orden = await db.OrdenCompra.findByPk(req.params.id);
            if (!orden) { 
                res.status(404).json({ message: "Orden no encontrada" }); 
                return; 
            }
            await orden.update(req.body);
            res.status(200).json({ message: "Orden actualizada exitosamente" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    // ============================================
    // DELETE /OrdenCompra/:id
    // ============================================
    private async deleteOrden(req: Request, res: Response): Promise<void> {
        try {
            const orden = await db.OrdenCompra.findByPk(req.params.id);
            if (!orden) { 
                res.status(404).json({ message: "Orden no encontrada" }); 
                return; 
            }
            await orden.destroy();
            res.status(200).json({ message: "Orden eliminada exitosamente" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
}