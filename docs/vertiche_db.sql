-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: VerticheSortFlow_DB
-- ------------------------------------------------------
-- Server version	8.4.8

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '';

DROP TABLE IF EXISTS `Anomalia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Anomalia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `epc` varchar(255) NOT NULL,
  `tipo_error` enum('TAG_DESCONOCIDO','LECTURA_DUPLICADA','BAHIA_INCORRECTA','TIENDA_INCORRECTA','QA_FALLIDO','PALET_INCOMPLETO','RSSI_BAJO','FUERA_DE_SECUENCIA') NOT NULL,
  `lector_id` varchar(255) DEFAULT NULL,
  `bahia` varchar(255) DEFAULT NULL,
  `etapa` enum('RECEPCION','QA','REGISTRO','SORTING','PACKING','AUDITORIA','SALIDA') NOT NULL,
  `timestamp` datetime NOT NULL,
  `proveedor_id` int DEFAULT NULL,
  `resuelto` tinyint(1) NOT NULL DEFAULT '0',
  `descripcion` varchar(255) DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  KEY `epc` (`epc`),
  KEY `proveedor_id` (`proveedor_id`),
  CONSTRAINT `Anomalia_ibfk_1` FOREIGN KEY (`epc`) REFERENCES `Tag` (`epc`) ON UPDATE CASCADE,
  CONSTRAINT `Anomalia_ibfk_2` FOREIGN KEY (`proveedor_id`) REFERENCES `Proveedor` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Caja`;
CREATE TABLE `Caja` (
  `caja_id` varchar(255) NOT NULL,
  `tienda_id` varchar(255) NOT NULL,
  `bahia` varchar(255) NOT NULL,
  `estado` enum('ABIERTA','EN_LLENADO','SELLADA','ENVIADA','ANULADA') NOT NULL DEFAULT 'ABIERTA',
  `timestamp_creacion` datetime NOT NULL,
  `timestamp_sellado` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`caja_id`),
  UNIQUE KEY `caja_id` (`caja_id`),
  KEY `tienda_id` (`tienda_id`),
  CONSTRAINT `Caja_ibfk_1` FOREIGN KEY (`tienda_id`) REFERENCES `Tienda` (`tienda_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `DetalleOrden`;
CREATE TABLE `DetalleOrden` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orden_id` varchar(255) NOT NULL,
  `sku` varchar(255) NOT NULL,
  `talla` varchar(255) DEFAULT NULL,
  `color` varchar(255) DEFAULT NULL,
  `cantidad` int NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  KEY `orden_id` (`orden_id`),
  CONSTRAINT `DetalleOrden_ibfk_1` FOREIGN KEY (`orden_id`) REFERENCES `OrdenCompra` (`orden_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `EventoLectura`;
CREATE TABLE `EventoLectura` (
  `id` int NOT NULL AUTO_INCREMENT,
  `epc` varchar(255) NOT NULL,
  `lector_id` varchar(255) NOT NULL,
  `bahia` varchar(255) NOT NULL,
  `timestamp` datetime NOT NULL,
  `etapa` enum('RECEPCION','QA','REGISTRO','SORTING','PACKING','AUDITORIA','SALIDA') NOT NULL,
  `rssi` float DEFAULT NULL,
  `antenna_port` varchar(255) DEFAULT NULL,
  `es_duplicado` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  KEY `epc` (`epc`),
  CONSTRAINT `EventoLectura_ibfk_1` FOREIGN KEY (`epc`) REFERENCES `Tag` (`epc`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `InspeccionQA`;
CREATE TABLE `InspeccionQA` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tag_epc` varchar(255) NOT NULL,
  `proveedor_id` int NOT NULL,
  `operador_id` varchar(255) NOT NULL,
  `resultado` enum('APROBADO','RECHAZADO','RETRABAJO','PENDIENTE') NOT NULL DEFAULT 'PENDIENTE',
  `defecto_tipo` varchar(255) DEFAULT NULL,
  `observacion` varchar(255) DEFAULT NULL,
  `fecha` datetime NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  KEY `tag_epc` (`tag_epc`),
  KEY `proveedor_id` (`proveedor_id`),
  CONSTRAINT `InspeccionQA_ibfk_1` FOREIGN KEY (`tag_epc`) REFERENCES `Tag` (`epc`) ON UPDATE CASCADE,
  CONSTRAINT `InspeccionQA_ibfk_2` FOREIGN KEY (`proveedor_id`) REFERENCES `Proveedor` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `OrdenCompra`;
CREATE TABLE `OrdenCompra` (
  `orden_id` varchar(255) NOT NULL,
  `proveedor_id` int NOT NULL,
  `modelo` varchar(255) DEFAULT NULL,
  `nombre_producto` varchar(255) NOT NULL,
  `estado` enum('CREADA','ENVIADA','EN_TRANSITO','RECIBIDA','PARCIAL','CANCELADA') NOT NULL DEFAULT 'CREADA',
  `total_esperados` int NOT NULL DEFAULT '0',
  `total_recibidos` int NOT NULL DEFAULT '0',
  `fecha_creacion` datetime NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`orden_id`),
  UNIQUE KEY `orden_id` (`orden_id`),
  KEY `proveedor_id` (`proveedor_id`),
  CONSTRAINT `OrdenCompra_ibfk_1` FOREIGN KEY (`proveedor_id`) REFERENCES `Proveedor` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Palet`;
CREATE TABLE `Palet` (
  `palet_id` varchar(255) NOT NULL,
  `pedido_id` varchar(255) NOT NULL,
  `orden_id` varchar(255) NOT NULL,
  `estado` enum('ESPERANDO','EN_RECEPCION','EN_QA','EN_PACKING','COMPLETADO','CON_ERROR') NOT NULL DEFAULT 'ESPERANDO',
  `total_prepacks` int NOT NULL DEFAULT '0',
  `creado_en` datetime NOT NULL,
  `timestamp_llegada` datetime DEFAULT NULL,
  `timestamp_salida` datetime DEFAULT NULL,
  `tiempo_ciclo_min` int DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`palet_id`),
  UNIQUE KEY `palet_id` (`palet_id`),
  KEY `pedido_id` (`pedido_id`),
  KEY `orden_id` (`orden_id`),
  CONSTRAINT `Palet_ibfk_1` FOREIGN KEY (`pedido_id`) REFERENCES `Pedido` (`pedido_id`) ON UPDATE CASCADE,
  CONSTRAINT `Palet_ibfk_2` FOREIGN KEY (`orden_id`) REFERENCES `OrdenCompra` (`orden_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `PaletEtapaLog`;
CREATE TABLE `PaletEtapaLog` (
  `id` int NOT NULL AUTO_INCREMENT,
  `palet_id` varchar(255) NOT NULL,
  `etapa` enum('RECEPCION','QA','REGISTRO','SORTING','PACKING','AUDITORIA','SALIDA') NOT NULL,
  `timestamp_entrada` datetime NOT NULL,
  `timestamp_salida` datetime DEFAULT NULL,
  `prepacks_entrada` int NOT NULL DEFAULT '0',
  `prepacks_salida` int NOT NULL DEFAULT '0',
  `tiene_anomalia` tinyint(1) NOT NULL DEFAULT '0',
  `notas` varchar(255) DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  KEY `palet_id` (`palet_id`),
  CONSTRAINT `PaletEtapaLog_ibfk_1` FOREIGN KEY (`palet_id`) REFERENCES `Palet` (`palet_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Pedido`;
CREATE TABLE `Pedido` (
  `pedido_id` varchar(255) NOT NULL,
  `proveedor_id` int NOT NULL,
  `estado` enum('PROGRAMADO','EN_TRANSITO','LLEGADO','PROCESADO','INCOMPLETO') NOT NULL DEFAULT 'PROGRAMADO',
  `fecha_pedido` datetime NOT NULL,
  `fecha_llegada` datetime DEFAULT NULL,
  `total_esperados` int NOT NULL DEFAULT '0',
  `total_recibidos` int NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`pedido_id`),
  UNIQUE KEY `pedido_id` (`pedido_id`),
  KEY `proveedor_id` (`proveedor_id`),
  CONSTRAINT `Pedido_ibfk_1` FOREIGN KEY (`proveedor_id`) REFERENCES `Proveedor` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `PrepackCaja`;
CREATE TABLE `PrepackCaja` (
  `id` int NOT NULL AUTO_INCREMENT,
  `epc` varchar(255) NOT NULL,
  `caja_id` varchar(255) NOT NULL,
  `timestamp_vinculacion` datetime NOT NULL,
  `es_correcto` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  KEY `epc` (`epc`),
  KEY `caja_id` (`caja_id`),
  CONSTRAINT `PrepackCaja_ibfk_1` FOREIGN KEY (`epc`) REFERENCES `Tag` (`epc`) ON UPDATE CASCADE,
  CONSTRAINT `PrepackCaja_ibfk_2` FOREIGN KEY (`caja_id`) REFERENCES `Caja` (`caja_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Proveedor`;
CREATE TABLE `Proveedor` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) NOT NULL,
  `codigo` varchar(255) NOT NULL,
  `contacto` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `creado_en` datetime NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  UNIQUE KEY `codigo` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Tag`;
CREATE TABLE `Tag` (
  `epc` varchar(255) NOT NULL,
  `sku` varchar(255) NOT NULL,
  `talla` varchar(255) DEFAULT NULL,
  `color` varchar(255) DEFAULT NULL,
  `cantidad_piezas` int NOT NULL DEFAULT '1',
  `proveedor_id` int NOT NULL,
  `tienda_id` varchar(255) NOT NULL,
  `palet_id` varchar(255) DEFAULT NULL,
  `pedido_id` varchar(255) DEFAULT NULL,
  `tipo_flujo` enum('CROSS_DOCK','ALMACENAJE','DEVOLUCION') NOT NULL DEFAULT 'CROSS_DOCK',
  `etapa_actual` enum('REGISTRADO','EN_QA','APROBADO','EN_SORTING','EN_CAJA','EN_AUDITORIA','RECHAZADO','ENVIADO') NOT NULL DEFAULT 'REGISTRADO',
  `qa_fallido` tinyint(1) NOT NULL DEFAULT '0',
  `registrado_en` datetime NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`epc`),
  UNIQUE KEY `epc` (`epc`),
  KEY `proveedor_id` (`proveedor_id`),
  KEY `tienda_id` (`tienda_id`),
  KEY `palet_id` (`palet_id`),
  KEY `pedido_id` (`pedido_id`),
  CONSTRAINT `Tag_ibfk_1` FOREIGN KEY (`proveedor_id`) REFERENCES `Proveedor` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Tag_ibfk_2` FOREIGN KEY (`tienda_id`) REFERENCES `Tienda` (`tienda_id`) ON UPDATE CASCADE,
  CONSTRAINT `Tag_ibfk_3` FOREIGN KEY (`palet_id`) REFERENCES `Palet` (`palet_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Tag_ibfk_4` FOREIGN KEY (`pedido_id`) REFERENCES `Pedido` (`pedido_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Tienda`;
CREATE TABLE `Tienda` (
  `tienda_id` varchar(255) NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `ciudad` varchar(255) NOT NULL,
  `region` varchar(255) DEFAULT NULL,
  `bahia_asignada` varchar(255) DEFAULT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT '1',
  `estado_rep` enum('ACTIVA','PAUSADA','CERRADA') NOT NULL DEFAULT 'ACTIVA',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`tienda_id`),
  UNIQUE KEY `tienda_id` (`tienda_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Usuario`;
CREATE TABLE `Usuario` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cognito_sub` varchar(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `rol` enum('ADMIN','OPS_MANAGER','SUPERVISOR','OPERATOR') NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  UNIQUE KEY `cognito_sub` (`cognito_sub`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
-- Dump completed on 2026-05-28 17:21:44
