-- ============================================================================
-- Migración 001 — Etapas SORTER y AUDITORIA en el flujo CEDIS
-- Fecha:        2026-06-01
-- Responsable:  team-rfid (Moisés Falcón)
-- Ámbito:       MÓDULO RFID. Coordinar con team-proveedores antes de correr
--               porque Anomalia.etapa también recibe los nuevos valores.
--
-- Motivo:
--   En el CEDIS hay un lector RFID físico en cada una de las 7 etapas del flujo
--   (PRE-REG, QA, REGISTRO, SORTER, BAHIA, AUDITORIA, ENVIO).
--   Los enums actuales solo soportan 5 etapas (RECEPCION, QA, SORTING, PACKING,
--   SALIDA) y 6 estados de prepack — esto deja las columnas REG, SORTER y
--   AUDITORIA del Gantt sin tags reales. Esta migración agrega:
--     - 'REGISTRO' y 'AUDITORIA' al enum EventoLectura.etapa / Anomalia.etapa
--     - 'EN_SORTING' y 'EN_AUDITORIA' al enum Tag.etapa_actual
--
-- Idempotencia:
--   MySQL no tiene "ADD VALUE IF NOT EXISTS" para enums, así que hacemos
--   MODIFY con la lista completa. Si los valores ya están, la operación
--   es no-op a nivel de datos.
--
-- Rollback:
--   Si se necesita revertir, ver el bloque comentado al final del archivo.
--   ADVERTENCIA: el rollback fallará si ya existen filas con los nuevos
--   valores; primero hay que UPDATE-arlas a un valor compatible.
-- ============================================================================

START TRANSACTION;

-- EventoLectura.etapa: agregar REGISTRO y AUDITORIA (en el orden lógico)
ALTER TABLE `EventoLectura`
  MODIFY `etapa` ENUM(
    'RECEPCION',
    'QA',
    'REGISTRO',
    'SORTING',
    'PACKING',
    'AUDITORIA',
    'SALIDA'
  ) NOT NULL;

-- Anomalia.etapa: mismo enum que EventoLectura (se redeclara en el modelo)
ALTER TABLE `Anomalia`
  MODIFY `etapa` ENUM(
    'RECEPCION',
    'QA',
    'REGISTRO',
    'SORTING',
    'PACKING',
    'AUDITORIA',
    'SALIDA'
  ) NOT NULL;

-- PaletEtapaLog.etapa: idem
ALTER TABLE `PaletEtapaLog`
  MODIFY `etapa` ENUM(
    'RECEPCION',
    'QA',
    'REGISTRO',
    'SORTING',
    'PACKING',
    'AUDITORIA',
    'SALIDA'
  ) NOT NULL;

-- Tag.etapa_actual: agregar EN_SORTING y EN_AUDITORIA
ALTER TABLE `Tag`
  MODIFY `etapa_actual` ENUM(
    'REGISTRADO',
    'EN_QA',
    'APROBADO',
    'EN_SORTING',
    'EN_CAJA',
    'EN_AUDITORIA',
    'RECHAZADO',
    'ENVIADO'
  ) NOT NULL DEFAULT 'REGISTRADO';

COMMIT;

-- ============================================================================
-- Verificación
-- ============================================================================
-- Después de correr la migración, valida que los nuevos valores estén
-- aceptados ejecutando:
--
--   SELECT COLUMN_TYPE
--   FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_NAME = 'EventoLectura' AND COLUMN_NAME = 'etapa';
--
--   SELECT COLUMN_TYPE
--   FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_NAME = 'Tag' AND COLUMN_NAME = 'etapa_actual';
--
-- Deben aparecer los 7 valores y los 8 valores respectivamente.

-- ============================================================================
-- ROLLBACK (no ejecutar a menos que haya un problema confirmado)
-- ============================================================================
-- UPDATE `Tag` SET etapa_actual='APROBADO' WHERE etapa_actual='EN_SORTING';
-- UPDATE `Tag` SET etapa_actual='EN_CAJA'  WHERE etapa_actual='EN_AUDITORIA';
-- UPDATE `EventoLectura` SET etapa='QA'      WHERE etapa='REGISTRO';
-- UPDATE `EventoLectura` SET etapa='PACKING' WHERE etapa='AUDITORIA';
-- UPDATE `Anomalia`      SET etapa='QA'      WHERE etapa='REGISTRO';
-- UPDATE `Anomalia`      SET etapa='PACKING' WHERE etapa='AUDITORIA';
-- UPDATE `PaletEtapaLog` SET etapa='QA'      WHERE etapa='REGISTRO';
-- UPDATE `PaletEtapaLog` SET etapa='PACKING' WHERE etapa='AUDITORIA';
--
-- ALTER TABLE `EventoLectura`
--   MODIFY `etapa` ENUM('RECEPCION','QA','SORTING','PACKING','SALIDA') NOT NULL;
-- ALTER TABLE `Anomalia`
--   MODIFY `etapa` ENUM('RECEPCION','QA','SORTING','PACKING','SALIDA') NOT NULL;
-- ALTER TABLE `PaletEtapaLog`
--   MODIFY `etapa` ENUM('RECEPCION','QA','SORTING','PACKING','SALIDA') NOT NULL;
-- ALTER TABLE `Tag`
--   MODIFY `etapa_actual` ENUM('REGISTRADO','EN_QA','APROBADO','RECHAZADO','EN_CAJA','ENVIADO')
--     NOT NULL DEFAULT 'REGISTRADO';
