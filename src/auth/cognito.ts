/* ============================================================================
 * Archivo: cognito.ts
 * Descripción: Cliente AWS SDK para Cognito + constantes derivadas (issuer,
 *              JWKS URL). Sin credenciales explícitas — el SDK toma las
 *              credenciales del IAM role del EC2 (LabRole en AWS Academy)
 *              vía Instance Metadata Service. En local, usa las del perfil
 *              AWS configurado.
 * ============================================================================ */
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

const REGION = process.env.COGNITO_REGION;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

if (!REGION || !USER_POOL_ID || !CLIENT_ID) {
    throw new Error(
        'Missing Cognito env vars: COGNITO_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID'
    );
}

export const cognitoConfig = {
    region: REGION,
    userPoolId: USER_POOL_ID,
    clientId: CLIENT_ID,
    issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
    jwksUrl: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
} as const;

export const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });
