/* ============================================================================
 * Archivo: TagController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad Tag (prepack RFID).
 *              Entidad central del sistema: listar y crear tags.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

export default class TagController extends AbstractController {
    //Singleton
    private static _instance: TagController;
    public static get instance(): TagController {
        return this._instance ||
            (this._instance = new this("Tag"));
    }
    protected initRoutes(): void {
        this.router.get('/listarTags',
            this.getListarTags.bind(this));
        this.router.post('/crearTag',
            this.postCrearTag.bind(this));
        this.router.get('/:id', this.getTagPorId.bind(this));
        this.router.put('/:id', this.putActualizarTag.bind(this));
        this.router.delete('/:id', this.deleteTag.bind(this));
    }

    private async getListarTags(req: Request, res: Response): Promise<void> {
        //SELECT * FROM Tag
        try {
            const tags = await db.Tag.findAll();
            res.status(200).json(tags);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
    private async postCrearTag(req: Request, res: Response): Promise<void> {
        //INSERT INTO Tag
        try {
            console.log(req.body);
            await db['Tag'].create(req.body);
            res.status(200).json({ message: "Registro de tag exitoso" });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
    private async getTagPorId(req: Request, res: Response): Promise<void> {
        try {
            const tag = await db.Tag.findByPk(req.params.id);
            if (!tag) { res.status(404).json({ message: "Tag no encontrado" }); return; }
            res.status(200).json(tag);
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async putActualizarTag(req: Request, res: Response): Promise<void> {
        try {
            const tag = await db.Tag.findByPk(req.params.id);
            if (!tag) { res.status(404).json({ message: "Tag no encontrado" }); return; }
            await tag.update(req.body);
            res.status(200).json({ message: "Tag actualizado exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
    private async deleteTag(req: Request, res: Response): Promise<void> {
        try {
            const tag = await db.Tag.findByPk(req.params.id);
            if (!tag) { res.status(404).json({ message: "Tag no encontrado" }); return; }
            await tag.destroy();
            res.status(200).json({ message: "Tag eliminado exitosamente" });
        } catch (err) { console.log(err); res.status(500).json(err); }
    }
}