-- ============================================================
-- Seed mínimo para probar el módulo RFID localmente.
-- Crea: 2 Proveedores, 3 Tiendas, 1 Pedido, 1 OrdenCompra, 1 Palet.
-- Esto basta para registrar tags y verlos en el Gantt.
-- ============================================================
-- Uso:
--   USE VerticheSortFlow_DEV_DB;
--   SOURCE c:/Users/eclip/Proyectoglobal/Vertiche_Backend/docs/seed_minimo.sql;
-- ============================================================

USE VerticheSortFlow_DEV_DB;

-- Proveedores
INSERT INTO Proveedor (nombre, codigo, contacto, email, creado_en, createdAt, updatedAt) VALUES
('Textiles del Norte SA', 'PROV-001', 'Juan Pérez', 'juan@textilesnorte.mx', NOW(), NOW(), NOW()),
('Confecciones Vertiche',  'PROV-002', 'Ana Gómez',  'ana@vertiche.mx',       NOW(), NOW(), NOW());

-- Tiendas (cada una asignada a una bahía)
INSERT INTO Tienda (tienda_id, nombre, ciudad, region, bahia_asignada, activa, estado_rep, createdAt, updatedAt) VALUES
('TDA-007', 'Vertiche Polanco',   'CDMX',        'Centro', 'BAHIA-1', 1, 'ACTIVA', NOW(), NOW()),
('TDA-012', 'Vertiche Monterrey', 'Monterrey',   'Norte',  'BAHIA-2', 1, 'ACTIVA', NOW(), NOW()),
('TDA-025', 'Vertiche Guadalajara','Guadalajara','Oeste',  'BAHIA-3', 1, 'ACTIVA', NOW(), NOW());

-- Pedido (necesario para que Palet tenga FK)
INSERT INTO Pedido (pedido_id, proveedor_id, estado, fecha_pedido, total_esperados, total_recibidos, createdAt, updatedAt) VALUES
('PED-2026-001', 1, 'EN_TRANSITO', NOW(), 50, 0, NOW(), NOW());

-- OrdenCompra (esta aparece en FlujoCEDIS)
INSERT INTO OrdenCompra (orden_id, proveedor_id, modelo, nombre_producto, estado, total_esperados, total_recibidos, fecha_creacion, createdAt, updatedAt) VALUES
('OC-2026-001', 1, 'PLAYERA-V1', 'Playera básica algodón', 'EN_TRANSITO', 50, 0, NOW(), NOW(), NOW());

-- Palet (vincula Tag → OC vía orden_id)
INSERT INTO Palet (palet_id, pedido_id, orden_id, estado, total_prepacks, creado_en, createdAt, updatedAt) VALUES
('PAL-001', 'PED-2026-001', 'OC-2026-001', 'ESPERANDO', 0, NOW(), NOW(), NOW());

-- Verificación
SELECT 'Proveedores:' AS tabla, COUNT(*) AS total FROM Proveedor
UNION SELECT 'Tiendas:', COUNT(*) FROM Tienda
UNION SELECT 'Pedidos:', COUNT(*) FROM Pedido
UNION SELECT 'Órdenes Compra:', COUNT(*) FROM OrdenCompra
UNION SELECT 'Palets:', COUNT(*) FROM Palet;
