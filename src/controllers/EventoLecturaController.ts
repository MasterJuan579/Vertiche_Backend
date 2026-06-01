/* ============================================================================
 * Archivo: EventoLecturaController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad EventoLectura. Listar y
 *              registrar lecturas RFID emitidas por los lectores del CD.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";
import { emit } from "../realtime/socketIo";

const ETAPA_A_ESTADO_PREPACK: Record<string, string> = {
    RECEPCION: 'REGISTRADO',
    QA: 'EN_QA',
    REGISTRO: 'APROBADO',
    SORTING: 'EN_SORTING',
    PACKING: 'EN_CAJA',
    AUDITORIA: 'EN_AUDITORIA',
    SALIDA: 'ENVIADO',
};

export default class EventoLecturaController extends AbstractController {
    //Singleton
    private static _instance: EventoLecturaController;
    public static get instance(): EventoLecturaController {
        return this._instance ||
            (this._instance = new this("EventoLectura"));
    }
    protected initRoutes(): void {
        this.router.get('/listarLecturas',
            this.getListarLecturas.bind(this));
        this.router.post('/crearLectura',
            this.postCrearLectura.bind(this));
        this.router.get('/:id', this.getLecturaPorId.bind(this));
        this.router.put('/:id', this.putActualizarLectura.bind(this));
        this.router.delete('/:id', this.deleteLectura.bind(this));
    }

    private async getListarLecturas(req: Request, res: Response): Promise<void> {
        //SELECT * FROM EventoLectura
        try {
            const lecturas = await db.EventoLectura.findAll();
            res.status(200).json(lecturas);
        } catch (err: any) {
            console.error('[EventoLecturaController.listarLecturas]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al listar lecturas' });
        }
    }
    private async postCrearLectura(req: Request, res: Response): Promise<void> {
        //INSERT INTO EventoLectura
        try {
            const body = req.body || {};
            const etapa = typeof body.etapa === 'string' ? body.etapa.trim().toUpperCase() : body.etapa;
            const payload = { ...body, etapa };

            const lectura = await db['EventoLectura'].create(payload);
            const lecturaPayload = await this.buildLecturaPayload(lectura);

            emit('lectura', lecturaPayload);

            if (etapa === 'SORTING') {
                await this.markTagInSorting(lecturaPayload.tag);
                emit('sorter-scan', this.buildSorterPayload(lecturaPayload));
            }

            res.status(200).json({
                message: "Registro de lectura exitoso",
                lectura: lecturaPayload,
            });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
            console.log(req.body);
            await db['EventoLectura'].create(req.body);
            res.status(200).json({ message: "Registro de lectura exitoso" });
        } catch (err: any) {
            console.error('[EventoLecturaController.crearLectura]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al crear lectura' });
        }
    }

    private async markTagInSorting(tag: any): Promise<void> {
        if (!tag?.epc || tag.etapa_actual === 'RECHAZADO' || tag.etapa_actual === 'ENVIADO') {
            return;
        }
        try {
            await db.Tag.update(
                { etapa_actual: ETAPA_A_ESTADO_PREPACK.SORTING },
                { where: { epc: tag.epc } }
            );
            tag.etapa_actual = ETAPA_A_ESTADO_PREPACK.SORTING;
        } catch (err) {
            console.log('[EventoLectura.sorting] No se pudo actualizar Tag.etapa_actual:', err);
        }
    }

    private async buildLecturaPayload(lectura: any): Promise<any> {
        const raw = typeof lectura.toJSON === 'function' ? lectura.toJSON() : lectura;
        const tag: any = raw.epc
            ? await db.Tag.findByPk(raw.epc, {
                include: [
                    { model: db.Tienda, attributes: ['tienda_id', 'nombre', 'ciudad', 'region', 'bahia_asignada'] },
                    { model: db.Proveedor, attributes: ['id', 'nombre', 'codigo'] },
                    {
                        model: db.Palet,
                        required: false,
                        include: [{ model: db.OrdenCompra, required: false }],
                    },
                ],
            })
            : null;

        return {
            id: raw.id,
            epc: raw.epc,
            lector_id: raw.lector_id,
            bahia: raw.bahia,
            etapa: raw.etapa,
            timestamp: raw.timestamp,
            rssi: raw.rssi,
            antenna_port: raw.antenna_port,
            es_duplicado: raw.es_duplicado,
            tag: tag ? this.buildTagPayload(tag) : null,
        };
    }

    private buildTagPayload(tag: any): any {
        return {
            epc: tag.epc,
            sku: tag.sku,
            talla: tag.talla,
            color: tag.color,
            cantidad_piezas: tag.cantidad_piezas,
            tienda_id: tag.tienda_id,
            tienda: tag.Tienda ? {
                tienda_id: tag.Tienda.tienda_id,
                nombre: tag.Tienda.nombre,
                ciudad: tag.Tienda.ciudad,
                region: tag.Tienda.region,
                bahia_asignada: tag.Tienda.bahia_asignada,
            } : null,
            proveedor_id: tag.proveedor_id,
            proveedor: tag.Proveedor ? {
                id: tag.Proveedor.id,
                nombre: tag.Proveedor.nombre,
                codigo: tag.Proveedor.codigo,
            } : null,
            palet_id: tag.palet_id,
            pedido_id: tag.pedido_id,
            orden_id: tag.Palet?.orden_id || tag.Palet?.OrdenCompra?.orden_id || null,
            producto: tag.Palet?.OrdenCompra?.nombre_producto || tag.sku,
            tipo_flujo: tag.tipo_flujo,
            etapa_actual: tag.etapa_actual,
            qa_fallido: tag.qa_fallido,
        };
    }

    private buildSorterPayload(lecturaPayload: any): any {
        const tag = lecturaPayload.tag;
        return {
            lectura_id: lecturaPayload.id,
            epc: lecturaPayload.epc,
            lector_id: lecturaPayload.lector_id,
            bahia: lecturaPayload.bahia,
            etapa: lecturaPayload.etapa,
            timestamp: lecturaPayload.timestamp,
            rssi: lecturaPayload.rssi,
            tag,
            prepack: {
                epc: tag?.epc || lecturaPayload.epc,
                orden_id: tag?.orden_id || tag?.pedido_id || null,
                producto: tag?.producto || tag?.sku || 'Prepack sin detalle',
                proveedor: tag?.proveedor?.nombre || null,
                tienda: tag?.tienda || null,
                tipo_flujo: tag?.tipo_flujo || null,
                qa_fallido: !!tag?.qa_fallido,
                tag,
            },
        };
    }

    private async getLecturaPorId(req: Request, res: Response): Promise<void> {
        try {
            const lectura = await db.EventoLectura.findByPk(req.params.id);
            if (!lectura) { res.status(404).json({ error: 'no_encontrado', message: "Lectura no encontrada" }); return; }
            res.status(200).json(lectura);
        } catch (err: any) { console.error('[EventoLecturaController.getLecturaPorId]', err); res.status(500).json({ error: 'error_interno', message: err.message || 'Error al obtener lectura' }); }
    }
    private async putActualizarLectura(req: Request, res: Response): Promise<void> {
        try {
            const lectura = await db.EventoLectura.findByPk(req.params.id);
            if (!lectura) { res.status(404).json({ error: 'no_encontrado', message: "Lectura no encontrada" }); return; }
            await lectura.update(req.body);
            res.status(200).json({ message: "Lectura actualizada exitosamente" });
        } catch (err: any) { console.error('[EventoLecturaController.actualizarLectura]', err); res.status(500).json({ error: 'error_interno', message: err.message || 'Error al actualizar lectura' }); }
    }
    private async deleteLectura(req: Request, res: Response): Promise<void> {
        try {
            const lectura = await db.EventoLectura.findByPk(req.params.id);
            if (!lectura) { res.status(404).json({ error: 'no_encontrado', message: "Lectura no encontrada" }); return; }
            await lectura.destroy();
            res.status(200).json({ message: "Lectura eliminada exitosamente" });
        } catch (err: any) { console.error('[EventoLecturaController.deleteLectura]', err); res.status(500).json({ error: 'error_interno', message: err.message || 'Error al eliminar lectura' }); }
    }
}
