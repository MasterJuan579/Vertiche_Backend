-- ============================================================================
-- Migración 002 — Etapa EMPAQUETADO para EventoLectura
-- Fecha:        2026-06-01
-- Ámbito:       Backend RFID / Sorter cajas
--
-- Motivo:
--   El frontend /sorter/cajas debe reaccionar en tiempo real cuando llega un
--   POST a EventoLectura con etapa='EMPAQUETADO'. MySQL debe aceptar ese valor
--   en los enums donde se registran etapas RFID.
--
-- Idempotencia:
--   MySQL no soporta "ADD VALUE IF NOT EXISTS" para ENUM; se re-declara la
--   lista completa. Si el valor ya existe, esta operación conserva los datos.
-- ============================================================================

START TRANSACTION;

ALTER TABLE `EventoLectura`
  MODIFY `etapa` ENUM(
    'RECEPCION',
    'QA',
    'REGISTRO',
    'SORTING',
    'EMPAQUETADO',
    'PACKING',
    'AUDITORIA',
    'SALIDA'
  ) NOT NULL;

ALTER TABLE `Anomalia`
  MODIFY `etapa` ENUM(
    'RECEPCION',
    'QA',
    'REGISTRO',
    'SORTING',
    'EMPAQUETADO',
    'PACKING',
    'AUDITORIA',
    'SALIDA'
  ) NOT NULL;

ALTER TABLE `PaletEtapaLog`
  MODIFY `etapa` ENUM(
    'RECEPCION',
    'QA',
    'REGISTRO',
    'SORTING',
    'EMPAQUETADO',
    'PACKING',
    'AUDITORIA',
    'SALIDA'
  ) NOT NULL;

COMMIT;

-- Verificación:
-- SELECT COLUMN_TYPE
-- FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_NAME = 'EventoLectura' AND COLUMN_NAME = 'etapa';

