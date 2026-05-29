/* ============================================================================
 * Archivo: verifyToken.ts
 * ──────────────────────────────────────────────────────────────────────────
 *  Cambio menor del MÓDULO RFID: JWKS client lazy.
 *  Antes el cliente JWKS se creaba al cargar el módulo, leyendo cognitoConfig
 *  (lo que requería las env vars). Ahora solo se crea en la primera petición
 *  autenticada, permitiendo arrancar el backend en local sin Cognito.
 *  Comportamiento de las rutas /Auth/* sin cambios.
 * ──────────────────────────────────────────────────────────────────────────
 * Descripción: Middleware Express que valida el JWT id_token de Cognito.
 *              Verifica firma (JWKS cacheada), issuer, audience (clientId),
 *              token_use === 'id' y exp. Al éxito anexa
 *                  req.user = { cognito_sub, email, iat, exp }
 *              y llama next(). Al fallo responde 401 con un código corto.
 * ============================================================================ */
import { RequestHandler } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa';
import { cognitoConfig } from '../auth/cognito';

// Lazy: el cliente JWKS sólo se crea cuando la primera petición autenticada
// llega. En dev local sin Cognito, el módulo carga sin tocar las env vars.
let jwks: JwksClient | null = null;
function getJwks(): JwksClient {
    if (!jwks) {
        jwks = jwksClient({
            jwksUri: cognitoConfig.jwksUrl,
            cache: true,
            cacheMaxEntries: 5,
            cacheMaxAge: 10 * 60 * 60 * 1000, // 10h — JWKS keys rotate slowly
        });
    }
    return jwks;
}

function getSigningKey(kid: string): Promise<string> {
    return new Promise((resolve, reject) => {
        getJwks().getSigningKey(kid, (err, key) => {
            if (err || !key) {
                reject(err ?? new Error('Signing key not found'));
                return;
            }
            resolve(key.getPublicKey());
        });
    });
}

export const verifyToken: RequestHandler = async (req, res, next) => {
    try {
        const auth = req.header('authorization') ?? req.header('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) {
            res.status(401).json({ error: 'missing_token' });
            return;
        }
        const token = auth.slice('Bearer '.length).trim();

        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
            res.status(401).json({ error: 'invalid_token' });
            return;
        }

        const signingKey = await getSigningKey(decoded.header.kid);

        const payload = jwt.verify(token, signingKey, {
            issuer: cognitoConfig.issuer,
            audience: cognitoConfig.clientId,
            algorithms: ['RS256'],
        }) as JwtPayload;

        if (payload['token_use'] !== 'id') {
            res.status(401).json({ error: 'wrong_token_use' });
            return;
        }
        if (!payload.sub || typeof payload['email'] !== 'string') {
            res.status(401).json({ error: 'invalid_token_payload' });
            return;
        }

        req.user = {
            cognito_sub: payload.sub,
            email: payload['email'],
            iat: payload.iat ?? 0,
            exp: payload.exp ?? 0,
        };
        next();
    } catch (_err) {
        res.status(401).json({ error: 'invalid_token' });
    }
};
