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
        this.router.get('/kpi', this.getKpi.bind(this));
        this.router.post('/lectura', this.postLectura.bind(this));
        this.router.post('/orden-compra', this.postCrearOrdenCompra.bind(this));
        this.router.get('/orden/:orden_id/prepacks', this.getPrepacksDeOrden.bind(this));
        this.router.post('/asignar-epc', this.postAsignarEpc.bind(this));
        this.router.post('/uid-detectado', this.postUidDetectado.bind(this));
    }

    /**
     * GET /rfid/kpi
     * Métricas operativas del CEDIS calculadas en vivo desde la BD.
     * Lo consume la barra superior de FlujoCEDIS.
     *
     * Devuelve:
     *   - tiempo_promedio_min:        promedio de PaletEtapaLog.tiempo_ciclo_min de palets COMPLETADOS
     *   - benchmark_manual_min:       referencia teórica de un proceso manual (constante)
     *   - mejora_porcentaje:          (1 - tiempo_promedio / benchmark) * 100
     *   - objetivo_mejora_pct:        meta del CEDIS (constante)
     *   - palets_activos:             palets en ESPERANDO/EN_RECEPCION/EN_QA/EN_PACKING
     *   - palets_completados_hoy:     palets que cerraron timestamp_salida hoy
     *   - lecturas_hoy:               EventoLectura insertados hoy
     *   - anomalias_abiertas:         Anomalia con resuelto=false
     */
    private async getKpi(_req: Request, res: Response): Promise<void> {
        try {
            const BENCHMARK_MANUAL_MIN = 480; // 8h de proceso manual de referencia
            const OBJETIVO_MEJORA_PCT = 32;

            const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

            // Tiempo promedio de palets completados (los que ya tienen tiempo_ciclo_min)
            const [tiempoRows]: any = await db.sequelize.query(
                `SELECT AVG(tiempo_ciclo_min) AS prom, COUNT(*) AS n
                 FROM Palet WHERE estado='COMPLETADO' AND tiempo_ciclo_min IS NOT NULL`
            );
            const tiempoPromedio = tiempoRows?.[0]?.prom ? Math.round(Number(tiempoRows[0].prom)) : null;

            const mejora = tiempoPromedio
                ? Math.round(((BENCHMARK_MANUAL_MIN - tiempoPromedio) / BENCHMARK_MANUAL_MIN) * 1000) / 10
                : null;

            // Palets activos
            const activos: number = await db.Palet.count({
                where: { estado: ['ESPERANDO', 'EN_RECEPCION', 'EN_QA', 'EN_PACKING'] }
            });

            // Palets completados hoy
            const completadosHoy: number = await db.Palet.count({
                where: {
                    estado: 'COMPLETADO',
                    timestamp_salida: { [Op.gte]: hoy }
                }
            });

            // Lecturas hoy
            const lecturasHoy: number = await db.EventoLectura.count({
                where: { timestamp: { [Op.gte]: hoy } }
            });

            // Anomalías abiertas
            const anomaliasAbiertas: number = await db.Anomalia.count({
                where: { resuelto: false }
            });

            res.status(200).json({
                tiempo_promedio_min: tiempoPromedio,
                benchmark_manual_min: BENCHMARK_MANUAL_MIN,
                mejora_porcentaje: mejora,
                objetivo_mejora_pct: OBJETIVO_MEJORA_PCT,
                palets_activos: activos,
                palets_completados_hoy: completadosHoy,
                lecturas_hoy: lecturasHoy,
                anomalias_abiertas: anomaliasAbiertas,
                calculado_en: new Date().toISOString(),
            });
        } catch (err: any) {
            console.error('[RfidController.getKpi]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    /**
     * POST /rfid/uid-detectado
     * Modo REGISTRO del ESP32: cuando un chip nuevo se acerca al "Lector 1"
     * (el de registro), el ESP32 manda el UID aquí. Este endpoint NO escribe
     * nada en BD — solo emite por Socket.IO un evento 'uid-detectado' que
     * el frontend (modal "Asignar EPC") escucha para autocompletar el campo.
     *
     * Body: { uid: string, lector_id?: string }
     * Respuesta 200: { ok: true, uid }
     */
    private async postUidDetectado(req: Request, res: Response): Promise<void> {
        try {
            const uid = typeof req.body?.uid === 'string' ? req.body.uid.trim() : '';
            const lector_id = typeof req.body?.lector_id === 'string' ? req.body.lector_id.trim() : null;

            if (!uid) {
                res.status(400).json({
                    error: 'campos_requeridos',
                    message: 'uid es requerido',
                });
                return;
            }

            emit('uid-detectado', {
                uid,
                lector_id,
                timestamp: new Date().toISOString(),
            });

            res.status(200).json({ ok: true, uid });
        } catch (err: any) {
            console.error('[RfidController.uidDetectado]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    /**
     * POST /rfid/orden-compra
     * Crea TODO el contexto de una OC en una sola transacción:
     *   - 1 Pedido
     *   - 1 OrdenCompra
     *   - N Palets (según numero_palets)
     *   - 1 DetalleOrden por cada renglón del desglose
     *   - M Tags pre-declarados (placeholders), uno por cada prepack esperado.
     *     Cada Tag tiene EPC tipo 'PENDIENTE-{orden_id}-{n}' y los datos
     *     del renglón (sku, talla, color, piezas, tienda).
     *
     * Body: {
     *   proveedor_id,
     *   nombre_producto,
     *   modelo?,
     *   numero_palets?,
     *   detalles: [{ sku, talla, color, piezas_por_prepack, cantidad, tienda_id }]
     * }
     * Respuesta 201: { pedido, ordenCompra, palets, detalles, prepacks }
     */
    private async postCrearOrdenCompra(req: Request, res: Response): Promise<void> {
        const t = await db.sequelize.transaction();
        try {
            const body = req.body || {};
            const proveedor_id = body.proveedor_id;
            const nombre_producto = typeof body.nombre_producto === 'string' ? body.nombre_producto.trim() : '';
            const modelo = typeof body.modelo === 'string' ? body.modelo.trim() : null;
            const numero_palets = Math.max(1, Math.min(20, Number(body.numero_palets) || 1));
            const detalles = Array.isArray(body.detalles) ? body.detalles : [];

            // Validación de campos generales
            const faltantes: string[] = [];
            if (!proveedor_id) faltantes.push('proveedor_id');
            if (!nombre_producto) faltantes.push('nombre_producto');
            if (detalles.length === 0) faltantes.push('detalles (al menos 1 renglón)');
            if (faltantes.length > 0) {
                await t.rollback();
                res.status(400).json({
                    error: 'campos_requeridos',
                    message: `Faltan: ${faltantes.join(', ')}`,
                    detalle: faltantes,
                });
                return;
            }

            // Validación de cada renglón
            for (let i = 0; i < detalles.length; i++) {
                const d = detalles[i];
                if (!d.sku || !d.tienda_id || !Number(d.piezas_por_prepack) || !Number(d.cantidad)) {
                    await t.rollback();
                    res.status(400).json({
                        error: 'detalle_invalido',
                        message: `Renglón ${i + 1}: sku, tienda_id, piezas_por_prepack y cantidad son requeridos.`,
                    });
                    return;
                }
            }

            const proveedor = await db.Proveedor.findByPk(proveedor_id, { transaction: t });
            if (!proveedor) {
                await t.rollback();
                res.status(400).json({
                    error: 'fk_invalida',
                    message: `Proveedor con id ${proveedor_id} no existe`,
                });
                return;
            }

            // Verificar que todas las tiendas referenciadas existan
            const tiendaIds = [...new Set(detalles.map((d: any) => d.tienda_id))];
            const tiendas = await db.Tienda.findAll({
                where: { tienda_id: tiendaIds as string[] },
                transaction: t,
            });
            if (tiendas.length !== tiendaIds.length) {
                await t.rollback();
                res.status(400).json({
                    error: 'fk_invalida',
                    message: `Una o más tiendas no existen: ${tiendaIds.join(', ')}`,
                });
                return;
            }

            const ts = Date.now();
            const año = new Date().getFullYear();
            const sufijo = ts.toString().slice(-6);
            const pedido_id = `PED-${año}-${sufijo}`;
            const orden_id = `OC-${año}-${sufijo}`;

            const total_esperados = detalles.reduce((acc: number, d: any) => acc + Number(d.cantidad), 0);

            const pedido = await db.Pedido.create({
                pedido_id,
                proveedor_id,
                estado: 'EN_TRANSITO',
                fecha_pedido: new Date(),
                total_esperados,
                total_recibidos: 0,
            }, { transaction: t });

            const ordenCompra = await db.OrdenCompra.create({
                orden_id,
                proveedor_id,
                modelo,
                nombre_producto,
                estado: 'EN_TRANSITO',
                total_esperados,
                total_recibidos: 0,
                fecha_creacion: new Date(),
            }, { transaction: t });

            // N palets
            const palets: any[] = [];
            for (let i = 1; i <= numero_palets; i++) {
                const palet_id = `PAL-${sufijo}-${i}`;
                const palet = await db.Palet.create({
                    palet_id,
                    pedido_id,
                    orden_id,
                    estado: 'ESPERANDO',
                    total_prepacks: Math.ceil(total_esperados / numero_palets),
                    creado_en: new Date(),
                }, { transaction: t });
                palets.push(palet);
            }

            // DetalleOrden + Tags placeholder
            const detallesCreados: any[] = [];
            const prepacks: any[] = [];
            let globalIdx = 0;

            for (const d of detalles) {
                const cantidad = Number(d.cantidad);
                const piezas = Number(d.piezas_por_prepack);

                const detalle = await db.DetalleOrden.create({
                    orden_id,
                    sku: d.sku,
                    talla: d.talla || null,
                    color: d.color || null,
                    cantidad: piezas * cantidad,
                }, { transaction: t });
                detallesCreados.push(detalle);

                // Pre-crear los Tags placeholder
                for (let i = 0; i < cantidad; i++) {
                    globalIdx++;
                    const epc = `PENDIENTE-${orden_id}-${String(globalIdx).padStart(4, '0')}`;
                    const palet = palets[(globalIdx - 1) % palets.length]; // round-robin
                    const tag = await db.Tag.create({
                        epc,
                        sku: d.sku,
                        talla: d.talla || null,
                        color: d.color || null,
                        cantidad_piezas: piezas,
                        proveedor_id,
                        tienda_id: d.tienda_id,
                        palet_id: palet.palet_id,
                        pedido_id,
                        tipo_flujo: 'CROSS_DOCK',
                        etapa_actual: 'REGISTRADO',
                        qa_fallido: false,
                        registrado_en: new Date(),
                    }, { transaction: t });
                    prepacks.push(tag);
                }
            }

            await t.commit();
            res.status(201).json({
                pedido,
                ordenCompra,
                palets,
                detalles: detallesCreados,
                prepacks,
                total_prepacks: prepacks.length,
            });
        } catch (err: any) {
            await t.rollback();
            console.error('[RfidController.crearOrdenCompra]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al crear orden de compra' });
        }
    }

    /**
     * GET /rfid/orden/:orden_id/prepacks
     * Devuelve todos los Tags asociados a una OC (vía Palet.orden_id), separados
     * en pendientes (EPC tipo PENDIENTE-*) y asignados (con EPC real).
     */
    private async getPrepacksDeOrden(req: Request, res: Response): Promise<void> {
        try {
            const orden_id = req.params['orden_id'];
            const palets: any[] = await db.Palet.findAll({ where: { orden_id } });
            if (palets.length === 0) {
                res.status(404).json({ error: 'no_encontrado', message: 'OC sin palets' });
                return;
            }
            const paletIds = palets.map((p: any) => p.palet_id);
            const tags: any[] = await db.Tag.findAll({
                where: { palet_id: paletIds },
                include: [
                    { model: db.Tienda, attributes: ['tienda_id', 'nombre', 'bahia_asignada'] },
                ],
                order: [['epc', 'ASC']],
            });

            const pendientes = tags.filter((t: any) => String(t.epc).startsWith('PENDIENTE-'));
            const asignados = tags.filter((t: any) => !String(t.epc).startsWith('PENDIENTE-'));

            res.status(200).json({
                orden_id,
                total: tags.length,
                pendientes_count: pendientes.length,
                asignados_count: asignados.length,
                pendientes,
                asignados,
            });
        } catch (err: any) {
            console.error('[RfidController.getPrepacksDeOrden]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    /**
     * POST /rfid/asignar-epc
     * Body: { epc_placeholder, epc_real }
     * Cambia el EPC de un Tag pre-declarado al EPC real leído del chip RFID.
     * Sequelize emite UPDATE; FKs en cascada actualizan EventoLectura,
     * Anomalia, PrepackCaja e InspeccionQA si hubiera (no debería todavía,
     * el tag no había generado lecturas porque era placeholder).
     */
    private async postAsignarEpc(req: Request, res: Response): Promise<void> {
        try {
            const epc_placeholder = String(req.body?.epc_placeholder || '').trim();
            const epc_real = String(req.body?.epc_real || '').trim();

            if (!epc_placeholder || !epc_real) {
                res.status(400).json({
                    error: 'campos_requeridos',
                    message: 'epc_placeholder y epc_real son requeridos.',
                });
                return;
            }
            if (!epc_placeholder.startsWith('PENDIENTE-')) {
                res.status(400).json({
                    error: 'placeholder_invalido',
                    message: 'epc_placeholder debe empezar con "PENDIENTE-".',
                });
                return;
            }
            if (epc_real.startsWith('PENDIENTE-')) {
                res.status(400).json({
                    error: 'epc_invalido',
                    message: 'El EPC real no puede empezar con "PENDIENTE-".',
                });
                return;
            }

            const tag: any = await db.Tag.findByPk(epc_placeholder);
            if (!tag) {
                res.status(404).json({ error: 'no_encontrado', message: 'Prepack pendiente no existe.' });
                return;
            }

            // ¿El EPC real ya está en uso?
            const conflicto = await db.Tag.findByPk(epc_real);
            if (conflicto) {
                res.status(409).json({
                    error: 'epc_duplicado',
                    message: `Ya existe un tag con EPC "${epc_real}".`,
                });
                return;
            }

            // Sequelize ignora cambios a la PK con .update(). Usamos UPDATE
            // directo para que el cambio se propague (ON UPDATE CASCADE
            // se encarga de FKs hacia tag.epc en EventoLectura/Anomalia/etc.).
            await db.sequelize.query(
                'UPDATE `Tag` SET `epc` = :epcNuevo WHERE `epc` = :epcViejo',
                { replacements: { epcNuevo: epc_real, epcViejo: epc_placeholder } }
            );

            const tagActualizado: any = await db.Tag.findByPk(epc_real, {
                include: [{ model: db.Tienda, attributes: ['tienda_id', 'nombre', 'bahia_asignada'] }],
            });

            // Emit por socket para que las pantallas refresquen el listado
            emit('prepack-asignado', {
                epc_anterior: epc_placeholder,
                epc_nuevo: epc_real,
                tag: tagActualizado,
            });

            res.status(200).json({ message: 'EPC asignado correctamente', tag: tagActualizado });
        } catch (err: any) {
            console.error('[RfidController.asignarEpc]', err);
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
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
