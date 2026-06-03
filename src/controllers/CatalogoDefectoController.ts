/* ============================================================================
 * Archivo: CatalogoDefectoController.ts
 * Descripción: CRUD para el catálogo de tipos de defecto QA.
 *
 *  Rutas:
 *    GET  /CatalogoDefecto/listar      — lista todos los defectos activos
 *    GET  /CatalogoDefecto/todos       — lista activos e inactivos (admin)
 *    POST /CatalogoDefecto/crear       — crea un nuevo tipo de defecto
 *    POST /CatalogoDefecto/sembrar     — seed inicial (solo si tabla vacía)
 *    PUT  /CatalogoDefecto/:id         — actualiza nombre/criticidad/penalización
 *    DELETE /CatalogoDefecto/:id       — soft-delete (activo = false)
 *
 *  El endpoint /sembrar carga los 8 defectos base acordados con el frontend.
 *  Solo ejecuta el insert si la tabla está completamente vacía.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

const SEED_DEFECTOS = [
    { nombre: 'Mala calidad en la tela', penalizacion: 1.0, descripcion: 'Tela de mala calidad que no cumple estándares mínimos' },
    { nombre: 'Ruptura o rasgadura',     penalizacion: 1.0, descripcion: 'Daño físico irreparable en la prenda' },
    { nombre: 'Mancha o suciedad',       penalizacion: 1.0, descripcion: 'Contaminación visible en la prenda' },
    { nombre: 'Costura defectuosa',      penalizacion: 1.0, descripcion: 'Costura con defecto visible o funcional' },
    { nombre: 'Cantidad faltante',       penalizacion: 1.0, descripcion: 'Prepack con menos piezas de lo declarado' },
    { nombre: 'Etiqueta incorrecta',     penalizacion: 1.0, descripcion: 'Etiqueta con información incorrecta o desalineada' },
    { nombre: 'SKU equivocado',          penalizacion: 1.0, descripcion: 'El SKU del artículo no coincide con el pedido' },
    { nombre: 'Otro (especificar)',      penalizacion: 1.0, descripcion: 'Defecto no catalogado — requiere descripción manual en observación' },
];

export default class CatalogoDefectoController extends AbstractController {
    private static _instance: CatalogoDefectoController;
    public static get instance(): CatalogoDefectoController {
        return this._instance || (this._instance = new this("CatalogoDefecto"));
    }

    protected initRoutes(): void {
        this.router.get('/listar',    this.getListar.bind(this));
        this.router.get('/todos',     this.getTodos.bind(this));
        this.router.post('/sembrar',  this.postSembrar.bind(this));
        this.router.post('/crear',    this.postCrear.bind(this));
        this.router.put('/:id',       this.putActualizar.bind(this));
        this.router.delete('/:id',    this.deleteSoftDelete.bind(this));
    }

    // GET /listar — solo activos (frontend)
    private async getListar(_req: Request, res: Response): Promise<void> {
        try {
            const defectos = await db.CatalogoDefecto.findAll({
                where: { activo: true },
                order: [['criticidad', 'ASC'], ['nombre', 'ASC']]
            });
            res.status(200).json(defectos);
        } catch (err: any) {
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // GET /todos — activos e inactivos (admin)
    private async getTodos(_req: Request, res: Response): Promise<void> {
        try {
            const defectos = await db.CatalogoDefecto.findAll({
                order: [['criticidad', 'ASC'], ['nombre', 'ASC']]
            });
            res.status(200).json(defectos);
        } catch (err: any) {
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // POST /sembrar — seed inicial (idempotente: no actúa si ya hay registros)
    private async postSembrar(_req: Request, res: Response): Promise<void> {
        try {
            const count = await db.CatalogoDefecto.count();
            if (count > 0) {
                res.status(200).json({
                    message: 'El catálogo ya tiene datos. Seed omitido.',
                    total_existentes: count
                });
                return;
            }
            await db.CatalogoDefecto.bulkCreate(SEED_DEFECTOS);
            res.status(201).json({
                message: 'Catálogo sembrado exitosamente',
                total_insertados: SEED_DEFECTOS.length
            });
        } catch (err: any) {
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // POST /crear
    private async postCrear(req: Request, res: Response): Promise<void> {
        try {
            const defecto = await db.CatalogoDefecto.create(req.body);
            res.status(201).json({ message: 'Defecto creado exitosamente', defecto });
        } catch (err: any) {
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // PUT /:id
    private async putActualizar(req: Request, res: Response): Promise<void> {
        try {
            const defecto = await db.CatalogoDefecto.findByPk(req.params['id']);
            if (!defecto) {
                res.status(404).json({ error: 'no_encontrado', message: 'Defecto no encontrado' });
                return;
            }
            await defecto.update(req.body);
            res.status(200).json({ message: 'Defecto actualizado exitosamente', defecto });
        } catch (err: any) {
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }

    // DELETE /:id — soft delete
    private async deleteSoftDelete(req: Request, res: Response): Promise<void> {
        try {
            const defecto = await db.CatalogoDefecto.findByPk(req.params['id']);
            if (!defecto) {
                res.status(404).json({ error: 'no_encontrado', message: 'Defecto no encontrado' });
                return;
            }
            await defecto.update({ activo: false });
            res.status(200).json({ message: 'Defecto desactivado exitosamente' });
        } catch (err: any) {
            res.status(500).json({ error: 'error_interno', message: err.message });
        }
    }
}