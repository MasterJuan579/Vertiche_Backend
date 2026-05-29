/* ============================================================================
 * Archivo: AuthController.ts
 * Descripción: Singleton para rutas /Auth.
 *   GET    /Auth/me               — perfil del usuario autenticado.
 *   POST   /Auth/registrar        — crea Usuario (ADMIN). MySQL primero con
 *                                    cognito_sub placeholder, luego Cognito,
 *                                    actualiza al sub real; rollback al fallo.
 *   GET    /Auth/listarUsuarios   — lista todos los usuarios (ADMIN).
 *   DELETE /Auth/:id              — borra usuario por cognito_sub (ADMIN).
 *                                    Cognito primero, luego MySQL.
 *                                    Prohibido borrarse a uno mismo.
 * ============================================================================ */
import { Request, Response } from "express";
import { randomBytes } from "crypto";
import {
    AdminCreateUserCommand,
    AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import AbstractController from "./AbstractController";
import db from "../models";
import { verifyToken } from "../middleware/verifyToken";
import { requireRole } from "../middleware/requireRole";
import { cognitoClient, cognitoConfig } from "../auth/cognito";

const ALLOWED_ROLES = ['ADMIN', 'OPS_MANAGER', 'SUPERVISOR', 'OPERATOR'] as const;
type Rol = typeof ALLOWED_ROLES[number];

export default class AuthController extends AbstractController {
    //Singleton
    private static _instance: AuthController;
    public static get instance(): AuthController {
        return this._instance ||
            (this._instance = new this("Auth"));
    }

    protected initRoutes(): void {
        this.router.get('/me',
            verifyToken,
            this.getMe.bind(this));
        this.router.post('/registrar',
            verifyToken,
            requireRole('ADMIN'),
            this.postRegistrar.bind(this));
        this.router.get('/listarUsuarios',
            verifyToken,
            requireRole('ADMIN'),
            this.getListarUsuarios.bind(this));
        this.router.delete('/:id',
            verifyToken,
            requireRole('ADMIN'),
            this.deleteUsuario.bind(this));
    }

    /**
     * GET /Auth/me — Devuelve el perfil del usuario autenticado.
     * Lookup por req.user.cognito_sub (poblado por verifyToken).
     * 404 si el JWT es válido pero no existe fila en Usuario.
     */
    private async getMe(req: Request, res: Response): Promise<void> {
        try {
            const sub = req.user?.cognito_sub;
            if (!sub) {
                res.status(401).json({ error: 'unauthenticated' });
                return;
            }
            const usuario = await db.Usuario.findOne({
                where: { cognito_sub: sub },
                attributes: ['email', 'nombre', 'rol', 'activo'],
            });
            if (!usuario) {
                res.status(404).json({ error: 'usuario_no_registrado' });
                return;
            }
            res.status(200).json(usuario);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    /**
     * POST /Auth/registrar — Crea un usuario nuevo (ADMIN only).
     * Body: { email, nombre, rol, temporary_password? }.
     * Atomicidad: MySQL primero con sub placeholder, luego Cognito;
     * si Cognito falla, se borra la fila MySQL.
     */
    private async postRegistrar(req: Request, res: Response): Promise<void> {
        // Validate body
        const body = req.body ?? {};
        const { email, nombre, rol } = body;
        const providedPassword = body.temporary_password;

        if (typeof email !== 'string' || typeof nombre !== 'string' || typeof rol !== 'string') {
            res.status(400).json({ error: 'missing_fields' });
            return;
        }
        if (!ALLOWED_ROLES.includes(rol as Rol)) {
            res.status(400).json({ error: 'invalid_role' });
            return;
        }
        if (!/^.+@.+\..+$/.test(email)) {
            res.status(400).json({ error: 'invalid_email' });
            return;
        }

        const password = (typeof providedPassword === 'string' && providedPassword.length >= 8)
            ? providedPassword
            : generateTempPassword();
        const passwordWasGenerated = password !== providedPassword;

        // Step 1: Insert MySQL first with placeholder cognito_sub
        const placeholderSub = `__PENDING__${Date.now()}_${randomBytes(4).toString('hex')}`;
        let usuario: any;
        try {
            usuario = await db.Usuario.create({
                cognito_sub: placeholderSub,
                email,
                nombre,
                rol,
                activo: true,
            });
        } catch (err: any) {
            // Almost always a unique-constraint violation on email
            const isUnique = err?.name === 'SequelizeUniqueConstraintError';
            res.status(isUnique ? 409 : 400).json({
                error: isUnique ? 'email_already_exists' : 'mysql_insert_failed',
                detail: err?.message,
            });
            return;
        }

        // Step 2: Create the user in Cognito
        let realSub: string;
        try {
            const out = await cognitoClient.send(new AdminCreateUserCommand({
                UserPoolId: cognitoConfig.userPoolId,
                Username: email,
                TemporaryPassword: password,
                MessageAction: 'SUPPRESS',
                UserAttributes: [
                    { Name: 'email', Value: email },
                    { Name: 'email_verified', Value: 'true' },
                ],
            }));
            const subAttr = out.User?.Attributes?.find((a: any) => a.Name === 'sub');
            if (!subAttr?.Value) {
                throw new Error('Cognito did not return a sub attribute');
            }
            realSub = subAttr.Value;
        } catch (cogErr: any) {
            // Rollback MySQL row
            try {
                await usuario.destroy();
            } catch (rollbackErr) {
                console.log('MySQL rollback failed (orphan row):', rollbackErr);
            }
            res.status(500).json({
                error: 'cognito_create_failed',
                detail: cogErr?.message ?? String(cogErr),
            });
            return;
        }

        // Step 3: Update placeholder sub with the real one
        try {
            await usuario.update({ cognito_sub: realSub });
        } catch (updateErr) {
            // MySQL row has a Cognito user but the wrong sub. Best-effort cleanup of both.
            try {
                await cognitoClient.send(new AdminDeleteUserCommand({
                    UserPoolId: cognitoConfig.userPoolId,
                    Username: email,
                }));
            } catch (cogCleanupErr) {
                console.log('Cognito cleanup failed (orphan Cognito user):', cogCleanupErr);
            }
            try {
                await usuario.destroy();
            } catch (rollbackErr) {
                console.log('MySQL rollback failed:', rollbackErr);
            }
            res.status(500).json({ error: 'mysql_update_failed' });
            return;
        }

        // 201 Created. Include temp password ONLY when we generated it — admin
        // needs a way to share it. If the admin supplied it, they already know.
        const responseBody: Record<string, unknown> = {
            email,
            nombre,
            rol,
            activo: true,
            cognito_sub: realSub,
        };
        if (passwordWasGenerated) {
            responseBody['temporary_password'] = password;
        }
        res.status(201).json(responseBody);
    }

    /**
     * GET /Auth/listarUsuarios — Lista todos los usuarios (ADMIN only).
     * Devuelve solo campos seguros; cognito_sub se incluye porque es el ID
     * que el cliente usará para llamar DELETE /Auth/:id.
     */
    private async getListarUsuarios(req: Request, res: Response): Promise<void> {
        try {
            const usuarios = await db.Usuario.findAll({
                attributes: ['cognito_sub', 'email', 'nombre', 'rol', 'activo', 'createdAt'],
                order: [['createdAt', 'DESC']],
            });
            res.status(200).json(usuarios);
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }

    /**
     * DELETE /Auth/:id — Borra usuario por cognito_sub (ADMIN only).
     * Orden: Cognito primero, MySQL después (inverso al registro). Si Cognito
     * devuelve UserNotFoundException tratamos como soft-success (huérfano
     * pre-existente) y procedemos a borrar la fila MySQL. Prohibido borrarse
     * a uno mismo.
     */
    private async deleteUsuario(req: Request, res: Response): Promise<void> {
        try {
            const targetSub = req.params['id'];
            if (!targetSub) {
                res.status(400).json({ error: 'missing_id' });
                return;
            }
            const callerSub = req.user?.cognito_sub;
            if (callerSub && callerSub === targetSub) {
                res.status(403).json({ error: 'cannot_delete_self' });
                return;
            }
            const usuario = await db.Usuario.findOne({
                where: { cognito_sub: targetSub },
            });
            if (!usuario) {
                res.status(404).json({ error: 'usuario_no_encontrado' });
                return;
            }
            // Step 1: Delete from Cognito
            try {
                await cognitoClient.send(new AdminDeleteUserCommand({
                    UserPoolId: cognitoConfig.userPoolId,
                    Username: usuario.email,
                }));
            } catch (cogErr: any) {
                if (cogErr?.name !== 'UserNotFoundException') {
                    res.status(500).json({
                        error: 'cognito_delete_failed',
                        detail: cogErr?.message ?? String(cogErr),
                    });
                    return;
                }
                console.log('Cognito user already missing (orphan):', usuario.email);
            }
            // Step 2: Delete from MySQL
            try {
                await usuario.destroy();
            } catch (mysqlErr: any) {
                console.log('MySQL delete failed after Cognito delete (orphan row):', mysqlErr);
                res.status(500).json({
                    error: 'mysql_delete_failed_after_cognito_delete',
                    detail: mysqlErr?.message,
                });
                return;
            }
            res.status(200).json({ message: 'Usuario eliminado exitosamente' });
        } catch (err) {
            console.log(err);
            res.status(500).json(err);
        }
    }
}

/**
 * Genera una contraseña temporal que satisface la política por defecto de
 * Cognito (mayúscula + minúscula + número + símbolo, ≥ 8 caracteres).
 */
function generateTempPassword(): string {
    // 12 bytes -> 16 base64 chars. Prefix guarantees policy compliance.
    const random = randomBytes(12)
        .toString('base64')
        .replace(/\+/g, 'P')
        .replace(/\//g, 'S')
        .replace(/=/g, '');
    return 'Aa1!' + random;
}
