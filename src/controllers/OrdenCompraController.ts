/* ============================================================================
 * Archivo: OrdenCompraController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad OrdenCompra. Listar y
 *              crear órdenes de compra (cabecera).
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";
import { verifyToken } from "../middleware/verifyToken";

export default class OrdenCompraController extends AbstractController {
    //Singleton
    private static _instance: OrdenCompraController;
    public static get instance(): OrdenCompraController {
        return this._instance ||
            (this._instance = new this("OrdenCompra"));
    }
    
    protected initRoutes(): void {
        this.router.use(verifyToken);
        this.router.get('/listarOrdenes', this.getListarOrdenes.bind(this));
        this.router.post('/crearOrden', this.postCrearOrden.bind(this));
        this.router.get('/:id', this.getOrdenPorId.bind(this));
        this.router.put('/:id', this.putActualizarOrden.bind(this));
        this.router.delete('/:id', this.deleteOrden.bind(this));
    }

    // ============================================
    // GET /OrdenCompra/listarOrdenes
    // ============================================
    private async getListarOrdenes(_req: Request, res: Response): Promise<void> {
        try {
            // OrdenCompra NO tiene relacion directa hasMany Tag (ver
            // OrdenCompraModel.ts: solo hasMany Palet). Antes el controller
            // intentaba `include: db.Tag` y caia en un catch silencioso, lo
            // que dejaba siempre tags:[] y tagsPorEtapa vacio. Vamos por la
            // cadena real OrdenCompra → Palet → Tag → Tienda.
            const includeConfig: any[] = [
                {
                    model: db.Proveedor,
                    attributes: ['id', 'nombre', 'codigo']
                },
                {
                    model: db.Palet,
                    required: false,
                    include: [
                        {
                            model: db.Tag,
                            required: false,
                            include: [{ model: db.Tienda }]
                        }
                    ]
                }
            ];

            // Mapeo completo de Tag.etapa_actual (estados del backend) a las
            // columnas del Gantt visual. Antes faltaban EN_SORTING,
            // EN_AUDITORIA y RECHAZADO, ademas de que APROBADO mapeaba a
            // SORTER (incorrecto: APROBADO va a REGISTRO).
            const mapeoEtapa: Record<string, string> = {
                'REGISTRADO':   'PREREGISTRO',
                'EN_QA':        'QA',
                'APROBADO':     'REGISTRO',
                'EN_SORTING':   'SORTER',
                'EN_CAJA':      'BAHIA',
                'EN_AUDITORIA': 'AUDITORIA',
                'RECHAZADO':    'QA',
                'ENVIADO':      'ENVIO'
            };

            const ordenEtapas = ['PREREGISTRO', 'QA', 'REGISTRO', 'SORTER', 'BAHIA', 'AUDITORIA', 'ENVIO'];

            const ordenes = await db.OrdenCompra.findAll({
                include: includeConfig,
                order: [['fecha_creacion', 'DESC']]
            });

            const resultado = ordenes.map((orden: any) => {
                // Aplanar todos los Tag de todos los Palet de esta OC.
                const palets: any[] = orden.Palets || [];
                const tags: any[] = palets.flatMap((p: any) => p.Tags || []);
                const tieneTags = tags.length > 0;

                // Inicializar tagsPorEtapa
                const tagsPorEtapa: Record<string, any[]> = {
                    'PREREGISTRO': [], 'QA': [], 'REGISTRO': [],
                    'SORTER': [], 'BAHIA': [], 'AUDITORIA': [], 'ENVIO': []
                };

                const serializarTag = (tag: any) => ({
                    epc: tag.epc,
                    sku: tag.sku,
                    talla: tag.talla,
                    color: tag.color,
                    cantidad_piezas: tag.cantidad_piezas,
                    proveedor_id: tag.proveedor_id,
                    tienda_id: tag.tienda_id,
                    palet_id: tag.palet_id,
                    pedido_id: tag.pedido_id,
                    orden_id: orden.orden_id, // Lo agregamos para que el frontend pueda hacer match local si lo necesita
                    etapa_actual: tag.etapa_actual,
                    qa_fallido: tag.qa_fallido,
                    registrado_en: tag.registrado_en,
                    tienda: tag.Tienda,
                    prendas: [{ color: tag.color, talla: tag.talla, cantidad: tag.cantidad_piezas }]
                });

                for (const tag of tags) {
                    const etapa = mapeoEtapa[tag.etapa_actual] || 'PREREGISTRO';
                    if (tagsPorEtapa[etapa]) {
                        tagsPorEtapa[etapa].push(serializarTag(tag));
                    }
                }

                const etapasActivas = Object.entries(tagsPorEtapa)
                    .filter(([_, lista]) => lista.length > 0)
                    .map(([etapa]) => etapa);

                const etapasFinales = etapasActivas.length > 0 ? etapasActivas : ['PREREGISTRO'];
                const primeraEtapa = etapasFinales[0] ?? 'PREREGISTRO';
                const ultimaEtapa = etapasFinales[etapasFinales.length - 1] ?? 'PREREGISTRO';
                const idxMin = ordenEtapas.indexOf(primeraEtapa);
                const idxMax = ordenEtapas.indexOf(ultimaEtapa);

                // total_recibidos confiable = cantidad real de Tags asociados
                // a esta OC (independiente de lo que diga la columna en BD,
                // que puede venir desincronizada cuando se asignan EPCs).
                const totalRecibidosReal = tags.length;
                const totalEsperados = orden.total_esperados || 0;
                const faltantes = Math.max(0, totalEsperados - totalRecibidosReal);

                return {
                    orden_id: orden.orden_id,
                    nombre_producto: orden.nombre_producto,
                    proveedor_id: orden.proveedor_id,
                    Proveedor: orden.Proveedor,
                    total_esperados: totalEsperados,
                    total_recibidos: totalRecibidosReal,
                    estado: orden.estado,
                    faltantes,
                    pct: totalEsperados > 0 ? (totalRecibidosReal / totalEsperados) * 100 : 0,
                    hasErr: tieneTags ? tags.some((t: any) => t.qa_fallido) : false,
                    etapasActivas: etapasFinales,
                    tagsPorEtapa,
                    idxMin: idxMin >= 0 ? idxMin : 0,
                    idxMax: idxMax >= 0 ? idxMax : 0,
                    tags: tieneTags ? tags.map(serializarTag) : [],
                    createdAt: orden.createdAt,
                    updatedAt: orden.updatedAt
                };
            });

            res.status(200).json(resultado);
        } catch (err) {
            console.error('[OrdenCompraController.getListarOrdenes]', err);
            // Si todo falla, devolver al menos las órdenes básicas para no romper la UI.
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
            // Mismo fix que getListarOrdenes: ir via Palet ya que OrdenCompra
            // NO tiene relacion directa con Tag.
            const includeConfig: any[] = [
                { model: db.Proveedor },
                {
                    model: db.Palet,
                    required: false,
                    include: [
                        {
                            model: db.Tag,
                            required: false,
                            include: [
                                { model: db.Tienda },
                                { model: db.EventoLectura },
                                { model: db.Anomalia }
                            ]
                        }
                    ]
                }
            ];

            const orden = await db.OrdenCompra.findByPk(req.params['id'], {
                include: includeConfig
            });

            if (!orden) {
                res.status(404).json({ message: "Orden no encontrada" });
                return;
            }

            const palets: any[] = (orden as any).Palets || [];
            const tags: any[] = palets.flatMap((p: any) => p.Tags || []);
            const tieneTags = tags.length > 0;

            const mapeoEtapa: Record<string, string> = {
                'REGISTRADO':   'PREREGISTRO',
                'EN_QA':        'QA',
                'APROBADO':     'REGISTRO',
                'EN_SORTING':   'SORTER',
                'EN_CAJA':      'BAHIA',
                'EN_AUDITORIA': 'AUDITORIA',
                'RECHAZADO':    'QA',
                'ENVIADO':      'ENVIO'
            };

            const tagsPorEtapa: Record<string, any[]> = {
                'PREREGISTRO': [], 'QA': [], 'REGISTRO': [],
                'SORTER': [], 'BAHIA': [], 'AUDITORIA': [], 'ENVIO': []
            };

            const serializarTag = (tag: any) => ({
                ...tag.toJSON(),
                orden_id: (orden as any).orden_id,
                prendas: [{ color: tag.color, talla: tag.talla, cantidad: tag.cantidad_piezas }],
                ultimas_lecturas: tag.EventoLecturas,
                anomalias_pendientes: tag.Anomalias
            });

            for (const tag of tags) {
                const etapa = mapeoEtapa[tag.etapa_actual] || 'PREREGISTRO';
                if (tagsPorEtapa[etapa]) {
                    tagsPorEtapa[etapa].push(serializarTag(tag));
                }
            }

            const resultado = {
                ...orden.toJSON(),
                tagsPorEtapa,
                tags: tieneTags ? tags.map(serializarTag) : []
            };

            res.status(200).json(resultado);
        } catch (err) {
            console.error('[OrdenCompraController.getOrdenPorId]', err);
            // Fallback: devolver solo la orden básica
            try {
                const ordenBasica = await db.OrdenCompra.findByPk(req.params['id']);
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