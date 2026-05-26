import Server from "./provider/Server";
import {PORT,NODE_ENV} from './config';
import express from 'express';
import cors from 'cors';

//Controllers de Vertiche SortFlow
import ProveedorController from "./controllers/ProveedorController";
import TiendaController from "./controllers/TiendaController";
import OrdenCompraController from "./controllers/OrdenCompraController";
import DetalleOrdenController from "./controllers/DetalleOrdenController";
import PedidoController from "./controllers/PedidoController";
import PaletController from "./controllers/PaletController";
import PaletEtapaLogController from "./controllers/PaletEtapaLogController";
import TagController from "./controllers/TagController";
import EventoLecturaController from "./controllers/EventoLecturaController";
import CajaController from "./controllers/CajaController";
import PrepackCajaController from "./controllers/PrepackCajaController";
import InspeccionQAController from "./controllers/InspeccionQAController";
import AnomaliaController from "./controllers/AnomaliaController";

 const server:Server = new Server({
    port:PORT,
    env:NODE_ENV,
    middlewares:[
        express.json(),
        express.urlencoded({extended:true}),
        cors()
    ],
    controllers:[
        ProveedorController.instance,
        TiendaController.instance,
        OrdenCompraController.instance,
        DetalleOrdenController.instance,
        PedidoController.instance,
        PaletController.instance,
        PaletEtapaLogController.instance,
        TagController.instance,
        EventoLecturaController.instance,
        CajaController.instance,
        PrepackCajaController.instance,
        InspeccionQAController.instance,
        AnomaliaController.instance
    ]
 });
 server.init();