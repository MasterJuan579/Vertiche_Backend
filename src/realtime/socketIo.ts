/* ============================================================================
 * Archivo: socketIo.ts
 * ──────────────────────────────────────────────────────────────────────────
 *  MÓDULO RFID — infraestructura necesaria para los eventos en vivo.
 *  Responsable: team-rfid. Otros equipos pueden suscribirse a los eventos
 *  desde sus propios módulos, pero por favor no modifiquen este archivo
 *  sin coordinar con team-rfid.
 *  Ver docs/RFID_MODULE.md sección "Eventos Socket.IO".
 * ──────────────────────────────────────────────────────────────────────────
 * Descripción: Singleton del servidor Socket.IO.
 *              Se inicializa una sola vez en Server.init() y cualquier
 *              controller puede emitir eventos llamando emit(event, payload).
 *
 * Eventos que emite el backend:
 *   - 'lectura'   → nueva lectura RFID procesada (con tag relacionado)
 *   - 'anomalia'  → nueva anomalía detectada
 *   - 'tag'       → tag actualizado (crear, cambio de etapa, qa_fallido)
 *
 * Los clientes (frontend RFID, frontend Dashboard) se conectan vía
 * `io(API_BASE_URL)` y escuchan estos eventos.
 * ============================================================================ */
import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';

let io: SocketIOServer | null = null;

export function initSocketIo(httpServer: HttpServer): SocketIOServer {
    if (io) return io;

    const origins = process.env['CORS_ORIGIN']
        ?.split(',')
        .map(s => s.trim())
        .filter(Boolean) || ['http://localhost:5173'];

    io = new SocketIOServer(httpServer, {
        cors: {
            origin: origins,
            credentials: false,
        },
        transports: ['websocket', 'polling'],
    });

    io.on('connection', (socket) => {
        console.log(`[socket] cliente conectado: ${socket.id}`);
        socket.on('disconnect', (reason) => {
            console.log(`[socket] cliente desconectado: ${socket.id} (${reason})`);
        });
    });

    console.log('[socket] Socket.IO listo');
    return io;
}

export function emit(event: string, payload: any): void {
    if (!io) {
        console.warn(`[socket] emit("${event}") ignorado: io no inicializado`);
        return;
    }
    io.emit(event, payload);
}

export function getIo(): SocketIOServer | null {
    return io;
}
