/* ============================================================================
 * Archivo: express.d.ts
 * Descripción: Augmenta Express.Request con `user`, poblado por el middleware
 *              verifyToken tras validar el JWT (id_token) de Cognito.
 * ============================================================================ */
declare global {
    namespace Express {
        interface Request {
            user?: {
                cognito_sub: string;
                email: string;
                iat: number;
                exp: number;
            };
        }
    }
}

export {};
