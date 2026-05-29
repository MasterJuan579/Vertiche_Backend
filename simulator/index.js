// ============================================================================
// simulator/index.js
// Simulador de lectores RFID. Auto-registra tags y los va moviendo por las
// 5 etapas (RECEPCION → QA → SORTING → PACKING → SALIDA) mandando POSTs a
// /rfid/lectura cada CICLO_MS milisegundos. Inyecta anomalías aleatorias
// según los parámetros PROB_*.
//
// Uso:
//   node simulator/index.js
//   node simulator/index.js --base http://localhost:8080 --tags 12 --ciclo 1500
//
// Requiere Node 18+ (fetch nativo).
// ============================================================================

const args = parseArgs(process.argv.slice(2));
const API_BASE = args.base || process.env.API_BASE || 'http://localhost:8080';
const NUM_TAGS = parseInt(args.tags, 10) || 10;
const CICLO_MS = parseInt(args.ciclo, 10) || 2000;

const PROB_BAHIA_INCORRECTA = 0.08; // 8%
const PROB_RSSI_BAJO = 0.05;        // 5%
const PROB_DUPLICADA = 0.03;        // 3%

// Palets entre los que se reparten los tags. Si pasas --palet PAL-001 se usa
// solo ese. Por default usa los 4 del seed completo para repartir tags entre
// varias OCs y que el Gantt se vea poblado.
const PALETS_DEFAULT = ['PAL-001', 'PAL-002', 'PAL-003', 'PAL-004'];
const PALETS = args.palet ? [args.palet] : PALETS_DEFAULT;

const ETAPAS = ['RECEPCION', 'QA', 'SORTING', 'PACKING', 'SALIDA'];
const LECTORES = {
    RECEPCION: 'ESP32-REC-01',
    QA:        'ESP32-QA-01',
    SORTING:   'ESP32-SORT-01',
    PACKING:   'ESP32-PACK-01',
    SALIDA:    'ESP32-SAL-01',
};
const TALLAS = ['XS', 'S', 'M', 'L', 'XL'];
const COLORES = ['Azul', 'Negro', 'Blanco', 'Rojo', 'Verde', 'Gris'];

// Estado del simulador
let tiendas = [];
let proveedores = [];
const tags = []; // [{ epc, tienda, proveedor, etapaActual: índice }]
let totales = { lecturas: 0, anomalias: 0, duplicados: 0 };

const log = (...m) => console.log(`[${new Date().toISOString().substring(11, 19)}]`, ...m);

async function main() {
    log(`Simulador RFID arrancando…`);
    log(`  Backend:  ${API_BASE}`);
    log(`  Tags:     ${NUM_TAGS}`);
    log(`  Ciclo:    ${CICLO_MS}ms`);
    log('');

    // 1) Health check
    try {
        const r = await fetch(`${API_BASE}/rfid/health`);
        const j = await r.json();
        log(`✓ Backend OK (${j.ts})`);
    } catch (err) {
        log(`✗ Backend no responde: ${err.message}`);
        process.exit(1);
    }

    // 2) Cargar catálogos
    tiendas = await fetchJson(`/Tienda/listarTiendas`);
    proveedores = await fetchJson(`/Proveedor/listarProveedores`);
    if (tiendas.length === 0 || proveedores.length === 0) {
        log(`✗ Necesitas mínimo 1 tienda y 1 proveedor sembrados.`);
        log(`  Importa docs/seed_minimo.sql primero.`);
        process.exit(1);
    }
    log(`✓ ${tiendas.length} tiendas, ${proveedores.length} proveedores cargados`);

    // 3) Registrar los tags del simulador
    log('');
    log(`Registrando ${NUM_TAGS} tags…`);
    for (let i = 1; i <= NUM_TAGS; i++) {
        const epc = `SIM-${String(i).padStart(3, '0')}`;
        const tienda = randomItem(tiendas);
        const proveedor = randomItem(proveedores);
        const palet_id = PALETS[(i - 1) % PALETS.length]; // round-robin entre los palets
        const payload = {
            epc,
            sku: `PLAYERA-${String(i).padStart(3, '0')}`,
            talla: randomItem(TALLAS),
            color: randomItem(COLORES),
            cantidad_piezas: randomItem([6, 12, 24]),
            tienda_id: tienda.tienda_id,
            proveedor_id: proveedor.id,
            palet_id,
            tipo_flujo: 'CROSS_DOCK',
        };
        try {
            await postJson(`/Tag/crearTag`, payload);
            log(`  ✓ ${epc} → ${tienda.nombre} (${tienda.bahia_asignada}) → ${palet_id}`);
        } catch (err) {
            if (err.code === 'epc_duplicado') {
                log(`  ↺ ${epc} ya existía (ok)`);
            } else {
                log(`  ✗ ${epc}: ${err.message}`);
                continue;
            }
        }
        tags.push({ epc, tienda, proveedor, palet_id, etapaIdx: 0 });
    }

    log('');
    log(`Generando lecturas cada ${CICLO_MS}ms. Ctrl+C para detener.`);
    log('');

    // 4) Loop principal
    setInterval(tick, CICLO_MS);
}

async function tick() {
    if (tags.length === 0) return;

    const tag = randomItem(tags);
    const etapa = ETAPAS[tag.etapaIdx];
    const lector = LECTORES[etapa];

    // Decidir si esta lectura inyecta anomalía
    let bahia = tag.tienda.bahia_asignada;
    let rssi = -55 - Math.floor(Math.random() * 15); // -55 a -70 (normal)
    let inyectado = '';

    if (Math.random() < PROB_BAHIA_INCORRECTA && (etapa === 'PACKING' || etapa === 'SORTING')) {
        bahia = `BAHIA-${1 + Math.floor(Math.random() * 10)}`; // bahía aleatoria
        if (bahia === tag.tienda.bahia_asignada) bahia = 'BAHIA-9'; // fuerza distinta
        inyectado = ' [↗ BAHIA_INCORRECTA]';
    }
    if (Math.random() < PROB_RSSI_BAJO) {
        rssi = -76 - Math.floor(Math.random() * 14); // -76 a -90
        inyectado += ' [↗ RSSI_BAJO]';
    }

    const payload = {
        epc: tag.epc,
        lector_id: lector,
        etapa,
        bahia,
        rssi,
        antenna_port: '1',
    };

    try {
        const res = await postJson('/rfid/lectura', payload);
        totales.lecturas++;
        if (res.anomalias?.length > 0) totales.anomalias += res.anomalias.length;
        log(`${tag.epc} → ${etapa} @ ${lector} (rssi ${rssi})${inyectado}`);

        // Duplicado: vuelvo a mandar el mismo evento
        if (Math.random() < PROB_DUPLICADA) {
            setTimeout(async () => {
                await postJson('/rfid/lectura', payload).catch(() => {});
                totales.duplicados++;
                log(`  ↺ duplicada ${tag.epc} @ ${lector}`);
            }, 1000);
        }

        // Avanza con 40% de probabilidad. Más bajo = más lecturas por etapa.
        if (Math.random() < 0.4 && tag.etapaIdx < ETAPAS.length - 1) {
            tag.etapaIdx++;
        } else if (tag.etapaIdx === ETAPAS.length - 1 && Math.random() < 0.3) {
            // Tag completó el flujo y ya no recibe más lecturas.
            const idx = tags.indexOf(tag);
            if (idx >= 0) tags.splice(idx, 1);
            log(`  ✓ ${tag.epc} completó el flujo. Sale del pool (quedan ${tags.length}).`);
        }
    } catch (err) {
        log(`  ✗ Error ${tag.epc}: ${err.message}`);
    }
}

// ============================================================================
// Helpers
// ============================================================================

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i]?.replace(/^--/, '');
        const val = argv[i + 1];
        if (key && val) out[key] = val;
    }
    return out;
}

async function fetchJson(path) {
    const r = await fetch(`${API_BASE}${path}`);
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
    return r.json();
}

async function postJson(path, body) {
    const r = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
        const err = new Error(data?.message || data?.error || r.statusText);
        err.code = data?.error;
        throw err;
    }
    return data;
}

process.on('SIGINT', () => {
    log('');
    log(`Total: ${totales.lecturas} lecturas, ${totales.anomalias} anomalías, ${totales.duplicados} duplicados`);
    process.exit(0);
});

main().catch((err) => {
    log(`Error fatal: ${err.message}`);
    process.exit(1);
});
