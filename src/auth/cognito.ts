/* ============================================================================
 * Archivo: cognito.ts
 * ──────────────────────────────────────────────────────────────────────────
 *  Cambio menor del MÓDULO RFID: lectura LAZY de variables de entorno.
 *  Antes el módulo tiraba al cargar si faltaban COGNITO_*. Eso bloqueaba
 *  el desarrollo local sin Cognito (caso típico para team-rfid mientras
 *  simulábamos el ESP32). Ahora solo tira cuando alguien usa el cliente.
 *  Comportamiento en prod / con env vars: idéntico al anterior.
 * ──────────────────────────────────────────────────────────────────────────
 * Descripción: Cliente AWS SDK para Cognito + constantes derivadas (issuer,
 *              JWKS URL). Sin credenciales explícitas — el SDK toma las
 *              credenciales del IAM role del EC2 (LabRole en AWS Academy)
 *              vía Instance Metadata Service. En local, usa las del perfil
 *              AWS configurado.
 *
 * Las variables de entorno se leen LAZY: si nadie llama a las rutas /Auth/*
 * (típico en dev local sin Cognito), el módulo carga sin error. Sólo tira
 * cuando algún handler intenta usar cognitoConfig o cognitoClient.
 * ============================================================================ */
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

function readEnv() {
    const REGION = process.env['COGNITO_REGION'];
    const USER_POOL_ID = process.env['COGNITO_USER_POOL_ID'];
    const CLIENT_ID = process.env['COGNITO_CLIENT_ID'];
    if (!REGION || !USER_POOL_ID || !CLIENT_ID) {
        throw new Error(
            'Missing Cognito env vars: COGNITO_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID'
        );
    }
    return { REGION, USER_POOL_ID, CLIENT_ID };
}

let _config: any = null;
let _client: CognitoIdentityProviderClient | null = null;

export const cognitoConfig = new Proxy({} as any, {
    get(_t, prop: string) {
        if (!_config) {
            const { REGION, USER_POOL_ID, CLIENT_ID } = readEnv();
            _config = {
                region: REGION,
                userPoolId: USER_POOL_ID,
                clientId: CLIENT_ID,
                issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
                jwksUrl: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
            };
        }
        return _config[prop];
    },
});

export const cognitoClient = new Proxy({} as any, {
    get(_t, prop: string) {
        if (!_client) {
            const { REGION } = readEnv();
            _client = new CognitoIdentityProviderClient({ region: REGION });
        }
        return (_client as any)[prop];
    },
});
