/* ============================================================================
 * Archivo: ProveedorController.ts
 * Generado por: Eduardo Serrano Corona
 * Descripción: Controller singleton para la entidad Proveedor. Expone rutas
 *              para listar y crear proveedores. Sigue el patrón de
 *              ProyectoController.ts.
 * ============================================================================ */
import { Request, Response } from "express";
import AbstractController from "./AbstractController";
import db from "../models";

export default class ProveedorController extends AbstractController {
    //Singleton
    //Atributos de clase
    private static _instance: ProveedorController;
    //Métodos de clase
    public static get instance(): ProveedorController {
        return this._instance ||
            (this._instance = new this("Proveedor"));
    }
    //Método de instancia
    protected initRoutes(): void {
        this.router.get('/listarProveedores',
            this.getListarProveedores.bind(this));
        this.router.post('/crearProveedor',
            this.postCrearProveedor.bind(this));
        this.router.get('/:id',
            this.getProveedorPorId.bind(this));
        this.router.put('/:id',
            this.putActualizarProveedor.bind(this));
        this.router.delete('/:id',
            this.deleteProveedor.bind(this));
    }

    private async getListarProveedores(req: Request, res: Response): Promise<void> {
        //SELECT * FROM Proveedor
        try {
            const proveedores = await db.Proveedor.findAll();
            res.status(200).json(proveedores);
        } catch (err: any) {
            console.error('[ProveedorController.listarProveedores]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al listar proveedores' });
        }
    }
    private async postCrearProveedor(req: Request, res: Response): Promise<void> {
        //INSERT INTO Proveedor
        try {
            console.log(req.body);
            await db['Proveedor'].create(req.body);
            res.status(200).json({ message: "Registro de proveedor exitoso" });
        } catch (err: any) {
            console.error('[ProveedorController.crearProveedor]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al crear proveedor' });
        }
    }

    /**
 * GET /Proveedor/:id — Buscar un proveedor por su PK (id numérico).
 */
    private async getProveedorPorId(req: Request, res: Response): Promise<void> {
        //SELECT * FROM Proveedor WHERE id = :id
        try {
            const proveedor = await db.Proveedor.findByPk(req.params.id);
            if (!proveedor) {
                res.status(404).json({ error: 'no_encontrado', message: "Proveedor no encontrado" });
                return;
            }
            res.status(200).json(proveedor);
        } catch (err: any) {
            console.error('[ProveedorController.getProveedorPorId]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al obtener proveedor' });
        }
    }

    /**
     * PUT /Proveedor/:id — Actualiza los campos enviados en el body.
     */
    private async putActualizarProveedor(req: Request, res: Response): Promise<void> {
        //UPDATE Proveedor SET ... WHERE id = :id
        try {
            const proveedor = await db.Proveedor.findByPk(req.params.id);
            if (!proveedor) {
                res.status(404).json({ error: 'no_encontrado', message: "Proveedor no encontrado" });
                return;
            }
            await proveedor.update(req.body);
            res.status(200).json({ message: "Proveedor actualizado exitosamente" });
        } catch (err: any) {
            console.error('[ProveedorController.actualizarProveedor]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al actualizar proveedor' });
        }
    }

    /**
     * DELETE /Proveedor/:id — Elimina el proveedor con esa PK.
     */
    private async deleteProveedor(req: Request, res: Response): Promise<void> {
        //DELETE FROM Proveedor WHERE id = :id
        try {
            const proveedor = await db.Proveedor.findByPk(req.params.id);
            if (!proveedor) {
                res.status(404).json({ error: 'no_encontrado', message: "Proveedor no encontrado" });
                return;
            }
            await proveedor.destroy();
            res.status(200).json({ message: "Proveedor eliminado exitosamente" });
        } catch (err: any) {
            console.error('[ProveedorController.deleteProveedor]', err);
            res.status(500).json({ error: 'error_interno', message: err.message || 'Error al eliminar proveedor' });
        }
    }

}