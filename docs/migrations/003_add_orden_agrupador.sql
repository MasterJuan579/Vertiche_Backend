-- ============================================================================
-- Migración 003 — Agrupador RFID para OC (chip maestro opcional)
-- Fecha:        2026-06-09
-- Responsable:  team-rfid (Moisés Falcón)
-- Ámbito:       MÓDULO RFID. Coordinar con team-proveedores antes de correr
--               porque el endpoint /rfid/lectura agrega un branch que primero
--               busca en Tag y, si no existe, busca en OrdenAgrupador.
--
-- Motivo:
--   Para OCs simples (cross-dock con una sola tienda destino) el supervisor
--   quiere poder usar UN solo chip RFID "maestro" que represente todos los
--   prepacks de la OC. Cuando ese chip se lee en cualquier etapa, el sistema
--   avanza en cascada todos los Tag de esa OC. Es COMPLETAMENTE OPCIONAL —
--   coexiste con el flujo individual existente (cada Tag con su propio EPC).
--
--   Elegimos tabla nueva (no columna en Tag) porque Tag tiene 12 columnas
--   semánticamente atadas a un prepack físico (sku, talla, color, palet_id,
--   tienda_id, cantidad_piezas) que no aplican a un chip maestro. Una tabla
--   separada mantiene el modelo limpio y permite UNIQUE en epc + FK CASCADE.
--
-- Idempotencia:
--   CREATE TABLE IF NOT EXISTS para que se pueda re-correr sin error.
--
-- Rollback:
--   DROP TABLE OrdenAgrupador (al final del archivo, comentado).
-- ============================================================================

START TRANSACTION;

CREATE TABLE IF NOT EXISTS `OrdenAgrupador` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `orden_id`   VARCHAR(255) NOT NULL,
  `epc`        VARCHAR(255) NOT NULL,
  `createdAt`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_agrupador_orden` (`orden_id`),
  UNIQUE KEY `uniq_agrupador_epc`   (`epc`),
  CONSTRAINT `fk_agrupador_orden`
    FOREIGN KEY (`orden_id`) REFERENCES `OrdenCompra` (`orden_id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Convención de EPC (validada en aplicación, no en BD):
--   - Placeholders se crean como 'GRP-PENDIENTE-{orden_id}' al activar el flag.
--   - Los EPCs reales asignados desde el lector NO deben empezar con
--     'PENDIENTE-' ni colisionar con un Tag.epc existente (validado en
--     RfidController.postAsignarEpcAgrupador).

COMMIT;

-- ============================================================================
-- Verificación
-- ============================================================================
-- SHOW CREATE TABLE OrdenAgrupador;
-- SELECT * FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
--  WHERE TABLE_NAME = 'OrdenAgrupador';
-- Deben aparecer: PRIMARY, uniq_agrupador_orden, uniq_agrupador_epc,
-- fk_agrupador_orden.

-- ============================================================================
-- ROLLBACK (no ejecutar a menos que haya un problema confirmado)
-- ============================================================================
-- DROP TABLE IF EXISTS `OrdenAgrupador`;
