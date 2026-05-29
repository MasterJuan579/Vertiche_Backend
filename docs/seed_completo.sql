-- ============================================================
-- Seed completo para demo del módulo RFID.
-- Crea: 3 Proveedores, 10 Tiendas (una por bahía), 4 Pedidos,
--       4 Órdenes de Compra (productos distintos), 4 Palets.
-- Idempotente — borra los datos del seed antes de re-importar.
-- ============================================================

USE VerticheSortFlow_DEV_DB;

-- Limpiar datos del seed (en orden por FK)
DELETE FROM Anomalia      WHERE epc LIKE 'SIM-%' OR epc='RFID001';
DELETE FROM EventoLectura WHERE epc LIKE 'SIM-%' OR epc='RFID001';
DELETE FROM Tag           WHERE epc LIKE 'SIM-%' OR epc='RFID001';
DELETE FROM Palet         WHERE palet_id LIKE 'PAL-%';
DELETE FROM OrdenCompra   WHERE orden_id LIKE 'OC-2026-%';
DELETE FROM Pedido        WHERE pedido_id LIKE 'PED-2026-%';
DELETE FROM Tienda        WHERE tienda_id LIKE 'TDA-%';
DELETE FROM Proveedor     WHERE codigo LIKE 'PROV-%';

-- Proveedores
INSERT INTO Proveedor (id, nombre, codigo, contacto, email, creado_en, createdAt, updatedAt) VALUES
(1, 'Textiles del Norte SA',  'PROV-001', 'Juan Pérez',  'juan@textilesnorte.mx',  NOW(), NOW(), NOW()),
(2, 'Confecciones Vertiche',  'PROV-002', 'Ana Gómez',   'ana@vertiche.mx',        NOW(), NOW(), NOW()),
(3, 'Maquila Industrial S.A.','PROV-003', 'Luis Ramírez','luis@maquila.mx',        NOW(), NOW(), NOW());

-- Tiendas: una por cada una de las 10 bahías
INSERT INTO Tienda (tienda_id, nombre, ciudad, region, bahia_asignada, activa, estado_rep, createdAt, updatedAt) VALUES
('TDA-001', 'Vertiche Polanco',      'CDMX',         'Centro', 'BAHIA-1',  1, 'ACTIVA', NOW(), NOW()),
('TDA-002', 'Vertiche Monterrey',    'Monterrey',    'Norte',  'BAHIA-2',  1, 'ACTIVA', NOW(), NOW()),
('TDA-003', 'Vertiche Guadalajara',  'Guadalajara',  'Oeste',  'BAHIA-3',  1, 'ACTIVA', NOW(), NOW()),
('TDA-004', 'Vertiche Tijuana',      'Tijuana',      'Norte',  'BAHIA-4',  1, 'ACTIVA', NOW(), NOW()),
('TDA-005', 'Vertiche Puebla',       'Puebla',       'Centro', 'BAHIA-5',  1, 'ACTIVA', NOW(), NOW()),
('TDA-006', 'Vertiche Cancún',       'Cancún',       'Sur',    'BAHIA-6',  1, 'ACTIVA', NOW(), NOW()),
('TDA-007', 'Vertiche León',         'León',         'Centro', 'BAHIA-7',  1, 'ACTIVA', NOW(), NOW()),
('TDA-008', 'Vertiche Mérida',       'Mérida',       'Sur',    'BAHIA-8',  1, 'ACTIVA', NOW(), NOW()),
('TDA-009', 'Vertiche Querétaro',    'Querétaro',    'Centro', 'BAHIA-9',  1, 'ACTIVA', NOW(), NOW()),
('TDA-010', 'Vertiche Hermosillo',   'Hermosillo',   'Norte',  'BAHIA-10', 1, 'ACTIVA', NOW(), NOW());

-- Pedidos (uno por OC)
INSERT INTO Pedido (pedido_id, proveedor_id, estado, fecha_pedido, total_esperados, total_recibidos, createdAt, updatedAt) VALUES
('PED-2026-001', 1, 'EN_TRANSITO', NOW(), 50, 0, NOW(), NOW()),
('PED-2026-002', 2, 'EN_TRANSITO', NOW(), 30, 0, NOW(), NOW()),
('PED-2026-003', 3, 'EN_TRANSITO', NOW(), 40, 0, NOW(), NOW()),
('PED-2026-004', 1, 'EN_TRANSITO', NOW(), 25, 0, NOW(), NOW());

-- Órdenes de Compra
INSERT INTO OrdenCompra (orden_id, proveedor_id, modelo, nombre_producto, estado, total_esperados, total_recibidos, fecha_creacion, createdAt, updatedAt) VALUES
('OC-2026-001', 1, 'PLAYERA-V1',  'Playera básica algodón',   'EN_TRANSITO', 20, 0, NOW(), NOW(), NOW()),
('OC-2026-002', 2, 'JEANS-CLASIC','Jeans clásico mezclilla',  'EN_TRANSITO', 15, 0, NOW(), NOW(), NOW()),
('OC-2026-003', 3, 'BLUSA-FEM',   'Blusa femenina estampada', 'EN_TRANSITO', 20, 0, NOW(), NOW(), NOW()),
('OC-2026-004', 1, 'SHORT-DEP',   'Short deportivo unisex',   'EN_TRANSITO', 12, 0, NOW(), NOW(), NOW());

-- Palets (uno por OC)
INSERT INTO Palet (palet_id, pedido_id, orden_id, estado, total_prepacks, creado_en, createdAt, updatedAt) VALUES
('PAL-001', 'PED-2026-001', 'OC-2026-001', 'ESPERANDO', 0, NOW(), NOW(), NOW()),
('PAL-002', 'PED-2026-002', 'OC-2026-002', 'ESPERANDO', 0, NOW(), NOW(), NOW()),
('PAL-003', 'PED-2026-003', 'OC-2026-003', 'ESPERANDO', 0, NOW(), NOW(), NOW()),
('PAL-004', 'PED-2026-004', 'OC-2026-004', 'ESPERANDO', 0, NOW(), NOW(), NOW());

SELECT 'Proveedores:' AS tabla, COUNT(*) AS total FROM Proveedor
UNION SELECT 'Tiendas:',       COUNT(*) FROM Tienda
UNION SELECT 'Pedidos:',       COUNT(*) FROM Pedido
UNION SELECT 'OCs:',           COUNT(*) FROM OrdenCompra
UNION SELECT 'Palets:',        COUNT(*) FROM Palet;
