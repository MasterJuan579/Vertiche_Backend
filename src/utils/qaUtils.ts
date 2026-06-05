/* ============================================================================
 * Archivo: qaUtils.ts
 * Utilidades compartidas entre InspeccionQAController y PlanQAController.
 * ============================================================================ */

/**
 * Calcula cuántos prepacks auditar según el rating del proveedor y el total
 * de prepacks presentes hoy.
 *
 * Nivel  | Rating    | % Muestreo | Tope máximo
 * ELITE  | 4.5 – 5.0 |    15%     |  4 prepacks
 * MEDIA  | 3.5 – 4.4 |    30%     |  8 prepacks
 * BAJA   | 1.0 – 3.4 |    50%     | 12 prepacks
 */
export function calcularCuota(stars: number, totalPrepacks: number): number {
    if (totalPrepacks <= 0) return 0;
    if (stars >= 4.5) return Math.min(Math.ceil(totalPrepacks * 0.15), 4);
    if (stars >= 3.5) return Math.min(Math.ceil(totalPrepacks * 0.30), 8);
    return Math.min(Math.ceil(totalPrepacks * 0.50), 12);
}

/** Devuelve el inicio y fin del día en curso (00:00:00 – 00:00:00 siguiente). */
export function getRangoHoy(): { hoy: Date; manana: Date } {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    return { hoy, manana };
}