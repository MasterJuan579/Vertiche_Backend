/* ============================================================================
 * Archivo: requireRole.ts
 * Descripción: Factory de middleware Express. Dado un rol requerido, devuelve
 *              un middleware que: (1) lee req.user.cognito_sub (poblado por
 *              verifyToken), (2) busca la fila en Usuario, (3) rechaza 403 si
 *              la fila no existe, está inactiva, o el rol no coincide.
 *              Debe encadenarse DESPUÉS de verifyToken.
 * ============================================================================ */
import { RequestHandler } from 'express';
import db from '../models';

type Rol = 'ADMIN' | 'SUPERVISOR' | 'BAY_OPERATOR' | 'OPS_MANAGER' | 'QA_INSPECTOR';

export function requireRole(requiredRole: Rol): RequestHandler {
    return async (req, res, next) => {
        try {
            const sub = req.user?.cognito_sub;
            if (!sub) {
                res.status(401).json({ error: 'unauthenticated' });
                return;
            }
            const usuario = await db.Usuario.findOne({
                where: { cognito_sub: sub },
                attributes: ['rol', 'activo'],
            });
            if (!usuario) {
                res.status(403).json({ error: 'usuario_no_registrado' });
                return;
            }
            if (!usuario.activo) {
                res.status(403).json({ error: 'usuario_inactivo' });
                return;
            }
            if (usuario.rol !== requiredRole) {
                res.status(403).json({ error: 'forbidden' });
                return;
            }
            next();
        } catch (err) {
            console.log(err);
            res.status(500).json({ error: 'role_check_failed' });
        }
    };
}
