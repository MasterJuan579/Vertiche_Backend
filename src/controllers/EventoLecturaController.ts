/* ============================================================================
 * Archivo: EventoLecturaController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad EventoLectura. Listar y
 *              registrar lecturas RFID emitidas por los lectores del CD.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

export default class EventoLecturaController extends AbstractController {
    //Singleton
    private static _instance: EventoLecturaController;
    public static get instance(): EventoLecturaController {
        return this._instance ||
            (this._instance = new this("EventoLectura"));
    }
    protected initRoutes(): void {
        this.router.get('/listarLecturas',
            this.getListarLecturas.bind(this));
        this.router.post('/crearLectura',
            this.postCrearLectura.bind(this));
        this.router.get('/:id', this.getLecturaPorId.bind(this));
        this.router.put('/:id', this.putActualizarLectura.bind(this));
        this.router.delete('/:id', this.deleteLectura.bind(this));
    }

    private async getListarLecturas(req: Request, res: Response): Promise<void> {
        //SELECT * FROM EventoLectura
        try {
            const lecturas = await db.EventoLectura.findAll();
            res.status(200).json(lecturas);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
    private async postCrearLectura(req: Request, res: Response): Promise<void> {
        //INSERT INTO EventoLectura
        try {
            console.log(req.body);
            await db['EventoLectura'].create(req.body);
            res.status(200).json({ message: "Registro de lectura exitoso" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    private async getLecturaPorId(req: Request, res: Response): Promise<void> {
        try {
            const lectura = await db.EventoLectura.findByPk(req.params.id);
            if (!lectura) { res.status(404).json({ message: "Lectura no encontrada" }); return; }
            res.status(200).json(lectura);
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async putActualizarLectura(req: Request, res: Response): Promise<void> {
        try {
            const lectura = await db.EventoLectura.findByPk(req.params.id);
            if (!lectura) { res.status(404).json({ message: "Lectura no encontrada" }); return; }
            await lectura.update(req.body);
            res.status(200).json({ message: "Lectura actualizada exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async deleteLectura(req: Request, res: Response): Promise<void> {
        try {
            const lectura = await db.EventoLectura.findByPk(req.params.id);
            if (!lectura) { res.status(404).json({ message: "Lectura no encontrada" }); return; }
            await lectura.destroy();
            res.status(200).json({ message: "Lectura eliminada exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
}