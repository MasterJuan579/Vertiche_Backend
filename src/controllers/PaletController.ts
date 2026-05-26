/* ============================================================================
 * Archivo: PaletController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad Palet. Listar y crear
 *              palets (unidades físicas de transporte).
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

export default class PaletController extends AbstractController {
    //Singleton
    private static _instance: PaletController;
    public static get instance(): PaletController {
        return this._instance ||
            (this._instance = new this("Palet"));
    }
    protected initRoutes(): void {
        this.router.get('/listarPalets',
            this.getListarPalets.bind(this));
        this.router.post('/crearPalet',
            this.postCrearPalet.bind(this));

        this.router.get('/:id', this.getPaletPorId.bind(this));
        this.router.put('/:id', this.putActualizarPalet.bind(this));
        this.router.delete('/:id', this.deletePalet.bind(this));
    }

    private async getListarPalets(req: Request, res: Response): Promise<void> {
        //SELECT * FROM Palet
        try {
            const palets = await db.Palet.findAll();
            res.status(200).json(palets);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
    private async postCrearPalet(req: Request, res: Response): Promise<void> {
        //INSERT INTO Palet
        try {
            console.log(req.body);
            await db['Palet'].create(req.body);
            res.status(200).json({ message: "Registro de palet exitoso" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    private async getPaletPorId(req: Request, res: Response): Promise<void> {
        try {
            const palet = await db.Palet.findByPk(req.params.id);
            if (!palet) { res.status(404).json({ message: "Palet no encontrado" }); return; }
            res.status(200).json(palet);
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async putActualizarPalet(req: Request, res: Response): Promise<void> {
        try {
            const palet = await db.Palet.findByPk(req.params.id);
            if (!palet) { res.status(404).json({ message: "Palet no encontrado" }); return; }
            await palet.update(req.body);
            res.status(200).json({ message: "Palet actualizado exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async deletePalet(req: Request, res: Response): Promise<void> {
        try {
            const palet = await db.Palet.findByPk(req.params.id);
            if (!palet) { res.status(404).json({ message: "Palet no encontrado" }); return; }
            await palet.destroy();
            res.status(200).json({ message: "Palet eliminado exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
}