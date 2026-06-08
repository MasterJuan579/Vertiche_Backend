/* ============================================================================
 * Archivo: RfidController.ts
 * ──────────────────────────────────────────────────────────────────────────
 *  MÓDULO RFID — Responsable: team-rfid (Moisés Falcón).
 *  Otros equipos: por favor NO modifiquen este archivo sin coordinar.
 *
 *  Endpoints expuestos:
 *    GET  /rfid/health                      — ping del módulo
 *    GET  /rfid/kpi                         — KPIs en vivo del CEDIS (lo
 *                                              consume FlujoCEDIS)
 *    POST /rfid/lectura                     — endpoint smart del ESP32
 *                                              (detecta anomalías + avanza
 *                                              etapa + emite socket)
 *    POST /rfid/uid-detectado               — modo registro del ESP32
 *                                              (emite socket 'uid-detectado')
 *    POST /rfid/orden-compra                — crea OC completa con N palets
 *                                              + M tags placeholder
 *    GET  /rfid/orden/:orden_id/prepacks    — lista prepacks pendientes/asign.
 *    POST /rfid/asignar-epc                 — cambia EPC placeholder a real
 *
 *  Contrato con el hardware ESP32 documentado en docs/rfid_lectura_contrato.md.
 *  Resumen del módulo: docs/RFID_MODULE.md y API_GUIDE.md sección 9.
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
import { verifyToken } from "../middleware/verifyToken";

const VENTANA_DUPLICADO_MS = 5_000;
const UMBRAL_RSSI_BAJO = -75;

// Mapeo etapa del lector físico → estado del prepack (Tag.etapa_actual).
// Hay un lector RFID en cada una de las 7 etapas del flujo CEDIS.
// El estado solo avanza, nunca retrocede (excepto a RECHAZADO si qa_fallido).
const ETAPA_A_ESTADO_PREPACK: Record<string, string> = {
    RECEPCION: 'REGISTRADO',
    QA:        'EN_QA',
    REGISTRO:  'APROBADO',
    SORTING:   'EN_SORTING',
    EMPAQUETADO: 'EN_CAJA',
    PACKING:   'EN_CAJA',
    AUDITORIA: 'EN_AUDITORIA',
    SALIDA:    'ENVIADO',
};

// Orden de avance — no permitimos regresar a etapas anteriores.
const ORDEN_ESTADOS = [
    'REGISTRADO',
    'EN_QA',
    'APROBADO',
    'EN_SORTING',
    'EN_CAJA',
    'EN_AUDITORIA',
    'ENVIADO',
];

export default class RfidController extends AbstractController {
    private static _instance: RfidController;
    public static get instance(): RfidController {
        return this._instance || (this._instance = new this("rfid"));
    }

    protected initRoutes(): void {
        // Público — el ESP32 lo usa para verificar conectividad sin token
        this.router.get('/health', this.getHealth.bind(this));

        // Protegidos — requieren JWT válido de Cognito
        this.router.get('/kpi',                        verifyToken, this.getKpi.bind(this));
        this.router.post('/lectura',                   verifyToken, this.postLectura.bind(this));
        this.router.post('/bahia/scan',                verifyToken, this.postBahiaScan.bind(this));
        this.router.post('/orden-compra',              verifyToken, this.postCrearOrdenCompra.bind(this));
        this.router.get('/orden/:orden_id/prepacks',   verifyToken, this.getPrepacksDeOrden.bind(this));
        this.router.post('/asignar-epc',               verifyToken, this.postAsignarEpc.bind(this));
        this.router.post('/uid-detectado',             verifyToken, this.postUidDetectado.bind(this));
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
     * Body (formato nuevo — prepacks mixtos):
     *   detalles: [{
     *     tienda_id,
     *     cantidad,                 // copias idénticas de este prepack
     *     lineas: [{ sku, talla, color, cantidad }]   // surtido del prepack
     *   }]
     *
     * Body (formato viejo — retrocompatible, un solo color/talla por prepack):
     *   detalles: [{ sku, talla, color, piezas_por_prepack, cantidad, tienda_id }]
     *
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

            // Validación de cada renglón.
            // CAMBIO (prepacks mixtos): se acepta el formato nuevo con `lineas`
            // (surtido) y se mantiene el viejo (sku/talla/color/piezas) para no
            // romper a quien siga mandando el body anterior.
            // Validación de cada renglón
            // Validación de cada renglón
        for (let i = 0; i < detalles.length; i++) {
            const d = detalles[i];
            const tieneLineas = Array.isArray(d.lineas) && d.lineas.length > 0;

            // ✅ PRIMERO: detectar formato nuevo (con lineas)
            if (tieneLineas) {
                if (!d.tienda_id || !Number(d.cantidad) || Number(d.cantidad) <= 0) {
                    await t.rollback();
                    res.status(400).json({
                        error: 'detalle_invalido',
                        message: `Prepack ${i + 1}: tienda_id y cantidad (copias) son requeridos.`,
                    });
                    return;
                }
                for (let j = 0; j < d.lineas.length; j++) {
                    const ln = d.lineas[j];
                    if (!ln.sku || !ln.sku.trim() || !Number(ln.cantidad) || Number(ln.cantidad) <= 0) {
                        await t.rollback();
                        res.status(400).json({
                            error: 'detalle_invalido',
                            message: `Prepack ${i + 1}, línea ${j + 1}: sku y cantidad son requeridos.`,
                        });
                        return;
                    }
                }
            } 
            // ✅ SEGUNDO: formato viejo (retrocompatible)
            else {
                if (!d.sku || !d.tienda_id || !Number(d.piezas_por_prepack) || !Number(d.cantidad)) {
                    await t.rollback();
                    res.status(400).json({
                        error: 'detalle_invalido',
                        message: `Renglón ${i + 1}: sku, tienda_id, piezas_por_prepack y cantidad son requeridos.`,
                    });
                    return;
                }
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
                const cantidad = Number(d.cantidad); // copias de este prepack
                const tieneLineas = Array.isArray(d.lineas) && d.lineas.length > 0;

                // CAMBIO (prepacks mixtos): normalizamos a un arreglo de líneas
                // `surtido`. El formato viejo se convierte a una sola línea, así
                // el resto del flujo es idéntico para ambos.
                const surtido = tieneLineas
                    ? d.lineas.map((ln: any) => ({
                        sku: ln.sku,
                        talla: ln.talla || null,
                        color: ln.color || null,
                        cantidad: Number(ln.cantidad) || 1,
                    }))
                    : [{
                        sku: d.sku,
                        talla: d.talla || null,
                        color: d.color || null,
                        cantidad: Number(d.piezas_por_prepack) || 1,
                    }];

                // Piezas por prepack = suma de las cantidades del surtido.
                const piezas = surtido.reduce((acc: number, ln: any) => acc + ln.cantidad, 0);
                // SKU representativo del prepack (el de la primera línea).
                const skuPrincipal = surtido[0].sku;

                // Un DetalleOrden por línea del surtido (refleja la composición
                // real de la OC). cantidad = piezas de esa línea × copias.
                for (const ln of surtido) {
                    const detalle = await db.DetalleOrden.create({
                        orden_id,
                        sku: ln.sku,
                        talla: ln.talla,
                        color: ln.color,
                        cantidad: ln.cantidad * cantidad,
                    }, { transaction: t });
                    detallesCreados.push(detalle);
                }

                // Pre-crear los Tags placeholder (uno por copia del prepack)
                for (let i = 0; i < cantidad; i++) {
                    globalIdx++;
                    const epc = `PENDIENTE-${orden_id}-${String(globalIdx).padStart(4, '0')}`;
                    const palet = palets[(globalIdx - 1) % palets.length]; // round-robin
                    const tag = await db.Tag.create({
                        epc,
                        sku: skuPrincipal,
                        // Resumen talla/color: si el prepack es mixto se deja null
                        // (el detalle real vive en PrepackLinea). Si es simple,
                        // conserva el valor único como antes.
                        talla: surtido.length === 1 ? surtido[0].talla : null,
                        color: surtido.length === 1 ? surtido[0].color : null,
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

                    // CAMBIO (prepacks mixtos): persistir el surtido del prepack
                    // como filas en PrepackLinea (tabla nueva). Esto es lo que el
                    // frontend lee como `prendas` para mostrar el desglose.
                    for (const ln of surtido) {
                        await db.PrepackLinea.create({
                            epc,
                            sku: ln.sku,
                            talla: ln.talla,
                            color: ln.color,
                            cantidad: ln.cantidad,
                        }, { transaction: t });
                    }

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
                    // CAMBIO (prepacks mixtos): incluir el surtido del prepack.
                    { model: db.PrepackLinea, as: 'lineas', required: false },
                ],
                order: [['epc', 'ASC']],
            });

            // CAMBIO (prepacks mixtos): exponer las líneas como `prendas`, que es
            // la forma que las vistas del frontend ya saben leer. Cada línea
            // (talla/color/cantidad) se expande a `cantidad` entradas { talla, color }.
            const tagsConPrendas = tags.map((tag: any) => {
                const plano = tag.toJSON ? tag.toJSON() : tag;
                const lineas = plano.lineas || [];
                // Expandir cada línea (talla/color/cantidad) a `cantidad`
                // entradas { talla, color }. Loop simple para no depender de
                // métodos de Array de versiones de JS más nuevas.
                const prendas: any[] = [];
                for (const ln of lineas) {
                    const n = Number(ln.cantidad) || 1;
                    for (let k = 0; k < n; k++) {
                        prendas.push({ talla: ln.talla, color: ln.color });
                    }
                }
                return { ...plano, prendas };
            });

            const pendientes = tagsConPrendas.filter((t: any) => String(t.epc).startsWith('PENDIENTE-'));
            const asignados = tagsConPrendas.filter((t: any) => !String(t.epc).startsWith('PENDIENTE-'));

            res.status(200).json({
                orden_id,
                total: tagsConPrendas.length,
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
     * POST /rfid/bahia/scan
     * Arco RFID post-sorter: recibe el EPC que ya cayÃ³ en una bahÃ­a fÃ­sica y
     * resuelve de forma determinÃ­stica a quÃ© caja (1..3) debe ir.
     */
    private async postBahiaScan(req: Request, res: Response): Promise<void> {
        const t = await db.sequelize.transaction();
        try {
            const body = req.body || {};
            const epc = typeof body.epc === 'string' ? body.epc.trim() : '';
            const bahiaActual = this.normalizarBahiaActual(
                body.bahiaActual ?? body.bahia_actual ?? body.bahia ?? body.bay
            );

            const faltantes: string[] = [];
            if (!epc) faltantes.push('epc');
            if (bahiaActual === null) faltantes.push('bahiaActual');
            if (faltantes.length > 0) {
                await t.rollback();
                res.status(400).json({
                    error: 'campos_requeridos',
                    message: `Faltan campos: ${faltantes.join(', ')}`,
                    detalle: faltantes,
                });
                return;
            }
            const bahia = bahiaActual as number;

            let tag: any = await db.Tag.findByPk(epc, {
                include: [
                    { model: db.Tienda, attributes: ['tienda_id', 'nombre', 'ciudad', 'bahia_asignada'] },
                    {
                        model: db.Palet,
                        required: false,
                        include: [{ model: db.OrdenCompra, required: false }],
                    },
                ],
                transaction: t,
            });

            if (!tag) {
                tag = await this.crearTagDesdeScan(body, epc, t);
                if (!tag) {
                    await t.rollback();
                    res.status(404).json({
                        error: 'tag_no_encontrado',
                        message: 'El EPC no existe. Para alta automÃ¡tica manda sku, proveedor_id y tienda_id vÃ¡lidos.',
                    });
                    return;
                }
            }

            const tienda = tag.Tienda || await db.Tienda.findByPk(tag.tienda_id, {
                attributes: ['tienda_id', 'nombre', 'ciudad', 'bahia_asignada'],
                transaction: t,
            });
            if (!tienda) {
                await t.rollback();
                res.status(400).json({
                    error: 'fk_invalida',
                    message: `Tienda ${tag.tienda_id} no existe`,
                    detalle: 'tienda_id',
                });
                return;
            }

            const cajaDestino = await this.resolverCajaDestino(tag, bahia, t);
            const cajaId = this.buildCajaId(bahia, cajaDestino, tag.tienda_id);
            const ahora = new Date();

            await db.Caja.findOrCreate({
                where: { caja_id: cajaId },
                defaults: {
                    caja_id: cajaId,
                    tienda_id: tag.tienda_id,
                    bahia: this.formatBahia(bahia),
                    estado: 'EN_LLENADO',
                    timestamp_creacion: ahora,
                },
                transaction: t,
            });

            const vinculacionExistente: any = await db.PrepackCaja.findOne({
                where: { epc },
                order: [['timestamp_vinculacion', 'DESC']],
                transaction: t,
            });
            if (!vinculacionExistente) {
                await db.PrepackCaja.create({
                    epc,
                    caja_id: cajaId,
                    timestamp_vinculacion: ahora,
                    es_correcto: true,
                }, { transaction: t });
            }

            const lectura: any = await db.EventoLectura.create({
                epc,
                lector_id: `ARCO-BAHIA-${bahia}`,
                bahia: this.formatBahia(bahia),
                timestamp: ahora,
                etapa: 'EMPAQUETADO',
                rssi: typeof body.rssi === 'number' ? body.rssi : null,
                antenna_port: typeof body.antenna_port === 'string' ? body.antenna_port : null,
                es_duplicado: false,
            }, { transaction: t });

            if (tag.etapa_actual !== 'RECHAZADO' && tag.etapa_actual !== 'ENVIADO') {
                await tag.update({ etapa_actual: 'EN_CAJA' }, { transaction: t });
            }

            const ordenCompra = tag.Palet?.OrdenCompra || null;
            const response = {
                epc: tag.epc,
                bahiaActual: bahia,
                cajaDestino,
                orden_id: tag.Palet?.orden_id || ordenCompra?.orden_id || null,
                producto: ordenCompra?.nombre_producto || tag.sku,
                tienda: {
                    tienda_id: tienda.tienda_id,
                    nombre: tienda.nombre,
                    ciudad: tienda.ciudad,
                },
                timestamp: ahora.toISOString(),
            };

            await t.commit();

            const socketPayload = {
                ...response,
                caja_id: cajaId,
                lectura_id: lectura.id,
                tag: {
                    epc: tag.epc,
                    sku: tag.sku,
                    talla: tag.talla,
                    color: tag.color,
                    cantidad_piezas: tag.cantidad_piezas,
                    tienda_id: tag.tienda_id,
                    palet_id: tag.palet_id,
                    pedido_id: tag.pedido_id,
                    etapa_actual: 'EN_CAJA',
                },
            };
            emit('sorter-caja-scan', socketPayload);
            emit('lectura', {
                id: lectura.id,
                epc: tag.epc,
                lector_id: lectura.lector_id,
                bahia: lectura.bahia,
                etapa: lectura.etapa,
                timestamp: lectura.timestamp,
                rssi: lectura.rssi,
                antenna_port: lectura.antenna_port,
                es_duplicado: false,
                tag: socketPayload.tag,
            });

            res.status(200).json(response);
        } catch (err: any) {
            await t.rollback();
            console.error('[RfidController.bahiaScan]', err);
            res.status(500).json({
                error: 'error_interno',
                message: err.message || 'Error procesando scan de bahÃ­a',
            });
        }
    }

    /**
     * POST /rfid/lectura
     * Body esperado del ESP32:
     *   {
     *     epc: string,           // EPC leído del tag (requerido)
     *     lector_id: string,     // id del sensor que leyó (requerido)
     *     etapa: string,         // RECEPCION | QA | REGISTRO | SORTING |
     *                            //   PACKING | AUDITORIA | SALIDA (requerido)
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
            const etapa = this.normalizarEtapaLectura(body.etapa, lector_id, body.bahia);
            const bahia = this.normalizarBahiaLectura(
                body.bahia ?? body.bahiaActual ?? body.bahia_actual ?? body.bay
            );
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
                    message: `Etapa "${etapa}" no es válida. Usa: RECEPCION, QA, REGISTRO, SORTING, EMPAQUETADO, PACKING, AUDITORIA, SALIDA.`,
                });
                return;
            }

            const ahora = new Date();
            const anomaliasGeneradas: any[] = [];

            // 2) Buscar el tag
            const tag: any = await db.Tag.findByPk(epc, {
                include: [
                    { model: db.Tienda, attributes: ['tienda_id', 'nombre', 'ciudad', 'bahia_asignada'] },
                    {
                        model: db.Palet,
                        required: false,
                        include: [{ model: db.OrdenCompra, required: false }],
                    },
                ],
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

            // 4) Validación de bahía. Zonas genéricas como ZONA-PACKING
            // identifican el tipo de arco, no una bahía física concreta.
            if (
                (etapa === 'PACKING' || etapa === 'EMPAQUETADO' || etapa === 'SORTING') &&
                this.esBahiaFisica(bahia) &&
                tag.Tienda?.bahia_asignada
            ) {
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
                    talla: tag.talla,
                    color: tag.color,
                    cantidad_piezas: tag.cantidad_piezas,
                    tienda_id: tag.tienda_id,
                    tienda: tag.Tienda,
                    palet_id: tag.palet_id,
                    pedido_id: tag.pedido_id,
                    orden_id: tag.Palet?.orden_id || tag.Palet?.OrdenCompra?.orden_id || null,
                    producto: tag.Palet?.OrdenCompra?.nombre_producto || tag.sku,
                    tipo_flujo: tag.tipo_flujo,
                    etapa_actual: etapaCambio ? nuevoEstado : etapaAnterior,
                    qa_fallido: tag.qa_fallido,
                },
            };
            emit('lectura', lecturaPayload);

            if (etapa === 'SORTING') {
                emit('sorter-scan', {
                    lectura_id: lectura.id,
                    epc,
                    lector_id,
                    bahia,
                    bahiaDestino: lecturaPayload.tag.tienda?.bahia_asignada || null,
                    etapa,
                    timestamp: lectura.timestamp,
                    rssi,
                    tag: lecturaPayload.tag,
                    prepack: {
                        epc,
                        orden_id: lecturaPayload.tag.orden_id || lecturaPayload.tag.pedido_id || null,
                        producto: lecturaPayload.tag.producto || lecturaPayload.tag.sku || 'Prepack sin detalle',
                        proveedor: null,
                        tienda: lecturaPayload.tag.tienda || null,
                        bahiaDestino: lecturaPayload.tag.tienda?.bahia_asignada || null,
                        tipo_flujo: lecturaPayload.tag.tipo_flujo || null,
                        qa_fallido: !!lecturaPayload.tag.qa_fallido,
                        tag: lecturaPayload.tag,
                    },
                });
            }

            if (etapa === 'EMPAQUETADO') {
                const bahiaActual = this.normalizarBahiaActual(bahia) ||
                    this.normalizarBahiaActual(tag.Tienda?.bahia_asignada);

                if (bahiaActual) {
                    const cajaDestino = await this.resolverCajaDestino(tag, bahiaActual, undefined);
                    const cajaId = this.buildCajaId(bahiaActual, cajaDestino, tag.tienda_id);
                    const timestamp = lectura.timestamp || new Date();

                    await db.Caja.findOrCreate({
                        where: { caja_id: cajaId },
                        defaults: {
                            caja_id: cajaId,
                            tienda_id: tag.tienda_id,
                            bahia: this.formatBahia(bahiaActual),
                            estado: 'EN_LLENADO',
                            timestamp_creacion: timestamp,
                        },
                    });

                    const vinculacionExistente: any = await db.PrepackCaja.findOne({
                        where: { epc },
                        order: [['timestamp_vinculacion', 'DESC']],
                    });
                    if (!vinculacionExistente) {
                        await db.PrepackCaja.create({
                            epc,
                            caja_id: cajaId,
                            timestamp_vinculacion: timestamp,
                            es_correcto: true,
                        });
                    }

                    emit('sorter-caja-scan', {
                        lectura_id: lectura.id,
                        epc,
                        lector_id,
                        bahia: this.formatBahia(bahiaActual),
                        etapa,
                        timestamp,
                        rssi,
                        caja_id: cajaId,
                        cajaDestino,
                        bahiaActual,
                        orden_id: lecturaPayload.tag.orden_id || lecturaPayload.tag.pedido_id || null,
                        producto: lecturaPayload.tag.producto || lecturaPayload.tag.sku || 'Prepack sin detalle',
                        tienda: lecturaPayload.tag.tienda || null,
                        tag: {
                            ...lecturaPayload.tag,
                            etapa_actual: 'EN_CAJA',
                        },
                    });
                    emit('sorter-caja-pick', {
                        lectura_id: lectura.id,
                        epc,
                        lector_id,
                        etapa,
                        timestamp,
                        rssi,
                        caja_id: cajaId,
                        cajaDestino,
                        bahiaActual,
                        orden_id: lecturaPayload.tag.orden_id || lecturaPayload.tag.pedido_id || null,
                        producto: lecturaPayload.tag.producto || lecturaPayload.tag.sku || 'Prepack sin detalle',
                        tienda: lecturaPayload.tag.tienda || null,
                        tag: {
                            ...lecturaPayload.tag,
                            etapa_actual: 'EN_CAJA',
                        },
                    });
                } else {
                    console.warn(`[RfidController.postLectura] No se pudo resolver bahía para EMPAQUETADO epc=${epc}`);
                }
            }

            if (etapa === 'PACKING') {
                let vinculacion: any = await db.PrepackCaja.findOne({
                    where: { epc },
                    order: [['timestamp_vinculacion', 'DESC']],
                    include: [
                        {
                            model: db.Caja,
                            required: false,
                            include: [{ model: db.Tienda, required: false }],
                        },
                    ],
                });

                if (!vinculacion) {
                    const bahiaActual = this.normalizarBahiaActual(bahia) ||
                        this.normalizarBahiaActual(tag.Tienda?.bahia_asignada);

                    if (bahiaActual) {
                        const cajaDestino = await this.resolverCajaDestino(tag, bahiaActual, undefined);
                        const cajaId = this.buildCajaId(bahiaActual, cajaDestino, tag.tienda_id);
                        const timestamp = lectura.timestamp || new Date();

                        await db.Caja.findOrCreate({
                            where: { caja_id: cajaId },
                            defaults: {
                                caja_id: cajaId,
                                tienda_id: tag.tienda_id,
                                bahia: this.formatBahia(bahiaActual),
                                estado: 'EN_LLENADO',
                                timestamp_creacion: timestamp,
                            },
                        });

                        await db.PrepackCaja.create({
                            epc,
                            caja_id: cajaId,
                            timestamp_vinculacion: timestamp,
                            es_correcto: true,
                        });

                        emit('sorter-caja-scan', {
                            lectura_id: lectura.id,
                            epc,
                            lector_id,
                            bahia: this.formatBahia(bahiaActual),
                            etapa,
                            timestamp,
                            rssi,
                            caja_id: cajaId,
                            cajaDestino,
                            bahiaActual,
                            orden_id: lecturaPayload.tag.orden_id || lecturaPayload.tag.pedido_id || null,
                            producto: lecturaPayload.tag.producto || lecturaPayload.tag.sku || 'Prepack sin detalle',
                            tienda: lecturaPayload.tag.tienda || null,
                            tag: {
                                ...lecturaPayload.tag,
                                etapa_actual: 'EN_CAJA',
                            },
                        });

                        vinculacion = await db.PrepackCaja.findOne({
                            where: { epc },
                            order: [['timestamp_vinculacion', 'DESC']],
                            include: [
                                {
                                    model: db.Caja,
                                    required: false,
                                    include: [{ model: db.Tienda, required: false }],
                                },
                            ],
                        });
                    }
                }

                if (vinculacion) {
                    const cajaId = vinculacion.caja_id;
                    const cajaDestino = this.parseCajaDestino(cajaId);
                    const caja = vinculacion.Caja;
                    const tienda = lecturaPayload.tag.tienda || caja?.Tienda || null;
                    const bahiaActual = this.normalizarBahiaActual(caja?.bahia) ||
                        this.normalizarBahiaActual(bahia) ||
                        this.normalizarBahiaActual(tienda?.bahia_asignada);

                    emit('sorter-caja-pick', {
                        lectura_id: lectura.id,
                        epc,
                        lector_id,
                        etapa,
                        timestamp: lectura.timestamp,
                        rssi,
                        caja_id: cajaId,
                        cajaDestino,
                        bahiaActual,
                        orden_id: lecturaPayload.tag.orden_id || lecturaPayload.tag.pedido_id || null,
                        producto: lecturaPayload.tag.producto || lecturaPayload.tag.sku || 'Prepack sin detalle',
                        tienda,
                        tag: {
                            ...lecturaPayload.tag,
                            etapa_actual: 'EN_CAJA',
                        },
                    });
                } else {
                    console.warn(`[RfidController.postLectura] No existe PrepackCaja para epc=${epc}`);
                }
            }

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

    private normalizarBahiaActual(raw: any): number | null {
        if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1) return raw;
        if (typeof raw === 'string') {
            const match = raw.trim().match(/(\d+)\s*$/);
            if (!match) return null;
            const n = parseInt(match[1] || '', 10);
            return Number.isFinite(n) && n >= 1 ? n : null;
        }
        return null;
    }

    private normalizarBahiaLectura(raw: any): string | null {
        const numero = this.normalizarBahiaActual(raw);
        if (numero) return this.formatBahia(numero);
        if (typeof raw === 'string') {
            const value = raw.trim();
            return value || null;
        }
        return null;
    }

    private esBahiaFisica(raw: any): boolean {
        return typeof raw === 'string' && /^BAHIA-\d+$/i.test(raw.trim());
    }

    private normalizarEtapaLectura(raw: any, lectorId?: string | null, zona?: any): string | null {
        if (typeof raw !== 'string') return null;
        const etapa = raw.trim().toUpperCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
        const lector = String(lectorId || '').toUpperCase();
        const zonaLectura = String(zona || '').toUpperCase();

        if (['BAHIA', 'BAHÍA', 'BAHIA SCAN', 'BAHÍA SCAN', 'POST SORTER', 'POST-SORTER', 'POSTSORTER'].includes(etapa)) {
            return 'EMPAQUETADO';
        }

        // El arco físico de bahía es el paso post-sorter: decide la caja.
        // Si llega como PACKING desde ARCO-BAHIA, lo tratamos como EMPAQUETADO.
        if (
            etapa === 'PACKING' &&
            (
                (lector.includes('BAHIA') && !lector.includes('CAJA')) ||
                zonaLectura === 'ZONA-PACKING' ||
                zonaLectura === 'PACKING'
            )
        ) {
            return 'EMPAQUETADO';
        }

        return etapa;
    }

    private formatBahia(bahiaActual: number): string {
        return `BAHIA-${bahiaActual}`;
    }

    private buildCajaId(bahiaActual: number, cajaDestino: number, tiendaId: string): string {
        return `BAHIA-${bahiaActual}-CAJA-${cajaDestino}-${tiendaId}`;
    }

    private parseCajaDestino(cajaId: string): number | null {
        const match = String(cajaId || '').match(/CAJA-(\d+)/);
        if (!match) return null;
        const n = parseInt(match[1] || '', 10);
        return Number.isFinite(n) && n >= 1 && n <= 3 ? n : null;
    }

    private async resolverCajaDestino(tag: any, bahiaActual: number, transaction: any): Promise<number> {
        const vinculacion: any = await db.PrepackCaja.findOne({
            where: { epc: tag.epc },
            order: [['timestamp_vinculacion', 'DESC']],
            transaction,
        });
        const cajaExistente = this.parseCajaDestino(vinculacion?.caja_id);
        if (cajaExistente) return cajaExistente;

        return this.cajaDeterministicaPorTienda(tag.tienda_id, bahiaActual);
    }

    private cajaDeterministicaPorTienda(tiendaId: string, bahiaActual: number): number {
        const source = `${tiendaId || ''}:${bahiaActual}`;
        let hash = 0;
        for (let i = 0; i < source.length; i++) {
            hash = ((hash << 5) - hash) + source.charCodeAt(i);
            hash |= 0;
        }
        return (Math.abs(hash) % 3) + 1;
    }

    private async crearTagDesdeScan(body: any, epc: string, transaction: any): Promise<any | null> {
        const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
        const proveedor_id = body.proveedor_id;
        const tienda_id = typeof body.tienda_id === 'string' ? body.tienda_id.trim() : '';
        if (!sku || !proveedor_id || !tienda_id) return null;

        const [proveedor, tienda] = await Promise.all([
            db.Proveedor.findByPk(proveedor_id, { transaction }),
            db.Tienda.findByPk(tienda_id, { transaction }),
        ]);
        if (!proveedor || !tienda) return null;

        await db.Tag.create({
            epc,
            sku,
            talla: typeof body.talla === 'string' ? body.talla.trim() : null,
            color: typeof body.color === 'string' ? body.color.trim() : null,
            cantidad_piezas: Number(body.cantidad_piezas) || 1,
            proveedor_id,
            tienda_id,
            palet_id: body.palet_id || null,
            pedido_id: body.pedido_id || null,
            tipo_flujo: body.tipo_flujo || 'CROSS_DOCK',
            etapa_actual: 'APROBADO',
            qa_fallido: false,
            registrado_en: new Date(),
        }, { transaction });

        return db.Tag.findByPk(epc, {
            include: [
                { model: db.Tienda, attributes: ['tienda_id', 'nombre', 'ciudad', 'bahia_asignada'] },
                {
                    model: db.Palet,
                    required: false,
                    include: [{ model: db.OrdenCompra, required: false }],
                },
            ],
            transaction,
        });
    }
}

