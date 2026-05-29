/* ============================================================================
 * Archivo: RfidController.ts
 * ──────────────────────────────────────────────────────────────────────────
 *  MÓDULO RFID — Responsable: team-rfid (Moisés Falcón).
 *  Otros equipos: por favor NO modifiquen este archivo sin coordinar.
 *  Contrato con el hardware ESP32 documentado en docs/rfid_lectura_contrato.md.
 *  Resumen del módulo: docs/RFID_MODULE.md.
 * ──────────────────────────────────────────────────────────────────────────
 * Descripción: Endpoint inteligente que recibe lecturas RFID desde los
 *              lectores físicos (ESP32 + módulo RFID) y orquesta:
 *                - validación del EPC
 *                - detección de duplicados (mismo EPC + lector en <5s)
 *                - validación de bahía vs tienda destino
 *                - validación de RSSI bajo
 *                - actualización de Tag.etapa_actual según la etapa del lector
 *                - creación automática de Anomalia cuando aplica
 *                - broadcast por Socket.IO de 'lectura' / 'anomalia' / 'tag'
 *
 * El frontend RFID escucha esos eventos y actualiza UI al instante.
 * ============================================================================ */
import { Request, Response } from "express";
import { Op } from "sequelize";
import AbstractController from "./AbstractController";
import db from "../models";
import { emit } from "../realtime/socketIo";

const VENTANA_DUPLICADO_MS = 5_000;
const UMBRAL_RSSI_BAJO = -75;

// Mapeo etapa del lector físico → estado del prepack (Tag.etapa_actual)
// El estado solo avanza, nunca retrocede (excepto a RECHAZADO si qa_fallido).
const ETAPA_A_ESTADO_PREPACK: Record<string, string> = {
    RECEPCION: 'REGISTRADO',
    QA:        'EN_QA',
    SORTING:   'APROBADO',
    PACKING:   'EN_CAJA',
    SALIDA:    'ENVIADO',
};

// Orden de avance — no permitimos regresar a etapas anteriores.
const ORDEN_ESTADOS = ['REGISTRADO', 'EN_QA', 'APROBADO', 'EN_CAJA', 'ENVIADO'];

export default class RfidController extends AbstractController {
    private static _instance: RfidController;
    public static get instance(): RfidController {
        return this._instance || (this._instance = new this("rfid"));
    }

    protected initRoutes(): void {
        this.router.get('/health', this.getHealth.bind(this));
        this.router.post('/lectura', this.postLectura.bind(this));
    }

    /**
     * GET /rfid/health — útil para que el ESP32 valide conectividad antes
     * de mandar lecturas.
     */
    private async getHealth(_req: Request, res: Response): Promise<void> {
        res.status(200).json({ ok: true, ts: new Date().toISOString() });
    }

    /**
     * POST /rfid/lectura
     * Body esperado del ESP32:
     *   {
     *     epc: string,           // EPC leído del tag (requerido)
     *     lector_id: string,     // id del sensor que leyó (requerido)
     *     etapa: string,         // RECEPCION | QA | SORTING | PACKING | SALIDA (requerido)
     *     bahia?: string,        // id de bahía/zona física, ej "BAHIA-3"
     *     rssi?: number,         // intensidad de señal
     *     antenna_port?: string
     *   }
     *
     * Respuesta 200:
     *   { lectura, anomalias: [], tag, etapaAnterior, etapaNueva }
     */
    private async postLectura(req: Request, res: Response): Promise<void> {
        try {
            const body = req.body || {};
            const epc = typeof body.epc === 'string' ? body.epc.trim() : null;
            const lector_id = typeof body.lector_id === 'string' ? body.lector_id.trim() : null;
            const etapa = typeof body.etapa === 'string' ? body.etapa.trim().toUpperCase() : null;
            const bahia = typeof body.bahia === 'string' ? body.bahia.trim() : null;
            const rssi = typeof body.rssi === 'number' ? body.rssi : null;
            const antenna_port = typeof body.antenna_port === 'string' ? body.antenna_port : null;

            // 1) Validación de campos requeridos
            const faltantes: string[] = [];
            if (!epc) faltantes.push('epc');
            if (!lector_id) faltantes.push('lector_id');
            if (!etapa) faltantes.push('etapa');
            if (faltantes.length > 0) {
                res.status(400).json({
                    error: 'campos_requeridos',
                    message: `Faltan campos: ${faltantes.join(', ')}`,
                    detalle: faltantes,
                });
                return;
            }
            if (!ETAPA_A_ESTADO_PREPACK[etapa as string]) {
                res.status(400).json({
                    error: 'etapa_invalida',
                    message: `Etapa "${etapa}" no es válida. Usa: RECEPCION, QA, SORTING, PACKING, SALIDA.`,
                });
                return;
            }

            const ahora = new Date();
            const anomaliasGeneradas: any[] = [];

            // 2) Buscar el tag
            const tag: any = await db.Tag.findByPk(epc, {
                include: [{ model: db.Tienda, attributes: ['tienda_id', 'nombre', 'bahia_asignada'] }],
            });

            // 2a) Si no existe → TAG_DESCONOCIDO. Igual registramos la lectura.
            if (!tag) {
                const anom = await this.crearAnomalia({
                    epc, lector_id, bahia, etapa,
                    tipo_error: 'TAG_DESCONOCIDO',
                    descripcion: `EPC ${epc} leído por ${lector_id} pero no existe en el sistema.`,
                    timestamp: ahora,
                });
                anomaliasGeneradas.push(anom);

                emit('anomalia', anom);

                res.status(202).json({
                    message: 'Lectura recibida pero el EPC no existe en el sistema. Anomalía registrada.',
                    anomalias: [anom],
                    tag: null,
                });
                return;
            }

            // 3) Detección de duplicado en ventana de 5s (mismo epc + lector)
            const desde = new Date(ahora.getTime() - VENTANA_DUPLICADO_MS);
            const reciente = await db.EventoLectura.findOne({
                where: {
                    epc,
                    lector_id,
                    timestamp: { [Op.gte]: desde },
                },
                order: [['timestamp', 'DESC']],
            });
            const esDuplicado = !!reciente;

            if (esDuplicado) {
                const anom = await this.crearAnomalia({
                    epc, lector_id, bahia, etapa,
                    tipo_error: 'LECTURA_DUPLICADA',
                    descripcion: `Lectura repetida de ${epc} en ${lector_id} dentro de ${VENTANA_DUPLICADO_MS / 1000}s.`,
                    proveedor_id: tag.proveedor_id,
                    timestamp: ahora,
                });
                anomaliasGeneradas.push(anom);
            }

            // 4) Validación de bahía (sólo en PACKING / SORTING)
            if ((etapa === 'PACKING' || etapa === 'SORTING') && bahia && tag.Tienda?.bahia_asignada) {
                if (bahia !== tag.Tienda.bahia_asignada) {
                    const anom = await this.crearAnomalia({
                        epc, lector_id, bahia, etapa,
                        tipo_error: 'BAHIA_INCORRECTA',
                        descripcion: `Tag ${epc} leído en ${bahia} pero la tienda ${tag.tienda_id} corresponde a ${tag.Tienda.bahia_asignada}.`,
                        proveedor_id: tag.proveedor_id,
                        timestamp: ahora,
                    });
                    anomaliasGeneradas.push(anom);
                }
            }

            // 5) RSSI bajo
            if (rssi !== null && rssi < UMBRAL_RSSI_BAJO) {
                const anom = await this.crearAnomalia({
                    epc, lector_id, bahia, etapa,
                    tipo_error: 'RSSI_BAJO',
                    descripcion: `Lectura con RSSI ${rssi} dBm (umbral ${UMBRAL_RSSI_BAJO}).`,
                    proveedor_id: tag.proveedor_id,
                    timestamp: ahora,
                });
                anomaliasGeneradas.push(anom);
            }

            // 6) Insertar el EventoLectura
            const lectura: any = await db.EventoLectura.create({
                epc,
                lector_id,
                bahia: bahia || '',
                timestamp: ahora,
                etapa,
                rssi,
                antenna_port,
                es_duplicado: esDuplicado,
            });

            // 7) Actualización de Tag.etapa_actual
            const etapaAnterior = tag.etapa_actual;
            const nuevoEstado = ETAPA_A_ESTADO_PREPACK[etapa as string];
            const idxActual = ORDEN_ESTADOS.indexOf(etapaAnterior);
            const idxNuevo = nuevoEstado ? ORDEN_ESTADOS.indexOf(nuevoEstado) : -1;

            let etapaCambio = false;
            // No retroceder; no avanzar si el tag está RECHAZADO; no procesar duplicados
            if (
                !esDuplicado &&
                etapaAnterior !== 'RECHAZADO' &&
                nuevoEstado &&
                idxNuevo > idxActual
            ) {
                await tag.update({ etapa_actual: nuevoEstado });
                etapaCambio = true;
            }

            // 8) Emit eventos por socket
            const lecturaPayload = {
                id: lectura.id,
                epc,
                lector_id,
                bahia,
                etapa,
                timestamp: lectura.timestamp,
                rssi,
                antenna_port,
                es_duplicado: esDuplicado,
                tag: {
                    epc: tag.epc,
                    sku: tag.sku,
                    tienda_id: tag.tienda_id,
                    tienda: tag.Tienda,
                    etapa_actual: etapaCambio ? nuevoEstado : etapaAnterior,
                    qa_fallido: tag.qa_fallido,
                },
            };
            emit('lectura', lecturaPayload);

            for (const a of anomaliasGeneradas) {
                emit('anomalia', a);
            }

            if (etapaCambio) {
                emit('tag', {
                    epc: tag.epc,
                    etapa_actual: nuevoEstado,
                    etapaAnterior,
                });
            }

            res.status(200).json({
                lectura: lecturaPayload,
                anomalias: anomaliasGeneradas,
                tag: lecturaPayload.tag,
                etapaAnterior,
                etapaNueva: etapaCambio ? nuevoEstado : etapaAnterior,
            });
        } catch (err: any) {
            console.error('[RfidController.postLectura]', err);
            res.status(500).json({
                error: 'error_interno',
                message: err.message || 'Error procesando lectura',
            });
        }
    }

    private async crearAnomalia(data: any): Promise<any> {
        const anom = await db.Anomalia.create({
            epc: data.epc,
            tipo_error: data.tipo_error,
            lector_id: data.lector_id || null,
            bahia: data.bahia || null,
            etapa: data.etapa,
            timestamp: data.timestamp || new Date(),
            proveedor_id: data.proveedor_id || null,
            resuelto: false,
            descripcion: data.descripcion || null,
        });
        return anom;
    }
}
