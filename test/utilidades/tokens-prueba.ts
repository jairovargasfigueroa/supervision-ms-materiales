import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWTPayload,
  type JWTVerifyGetKey,
  SignJWT,
} from 'jose';

/** Valores de configuración de las pruebas (no hace falta Keycloak). */
export const CONFIG_PRUEBA = {
  KEYCLOAK_URL: 'http://keycloak.prueba',
  KEYCLOAK_REALM: 'supervision',
  AUDIENCIA: 'plataforma-api',
};
export const EMISOR_PRUEBA = `${CONFIG_PRUEBA.KEYCLOAK_URL}/realms/${CONFIG_PRUEBA.KEYCLOAK_REALM}`;

export interface OpcionesToken {
  emisor?: string;
  audiencia?: string;
  /** Segundos desde ahora; negativo para un token vencido. */
  venceEn?: number;
  payload?: JWTPayload;
}

export interface ClavesPrueba {
  /** JWKS local con la clave pública (reemplaza al de Keycloak). */
  jwks: JWTVerifyGetKey;
  /** Firma con la clave del JWKS. */
  firmar: (opciones?: OpcionesToken) => Promise<string>;
  /** Firma con otra clave que no está en el JWKS (con el mismo `kid`). */
  firmarConOtraClave: (opciones?: OpcionesToken) => Promise<string>;
  /**
   * Firma con la clave del JWKS un token con esos roles (`realm_access.roles`), iniciado desde
   * el cliente `azp` (por defecto `erp`). Ejemplo: `firmarConRoles(['residente', 'cliente'], 'portal')`.
   */
  firmarConRoles: (
    roles: string[],
    azp?: string,
    opciones?: OpcionesToken,
  ) => Promise<string>;
}

/** Clientes de Keycloak (`azp`) que se usan en las pruebas. */
export const AZP = {
  erp: 'erp',
  portal: 'portal',
  appObra: 'app-obra',
  gateway: 'gateway',
} as const;

const KID = 'clave-prueba';

async function firmarCon(
  clave: CryptoKey,
  opciones: OpcionesToken = {},
): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  return new SignJWT({
    azp: 'erp',
    realm_access: { roles: ['residente'] },
    ...opciones.payload,
  })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setSubject(opciones.payload?.sub ?? '11111111-1111-1111-1111-111111111111')
    .setIssuer(opciones.emisor ?? EMISOR_PRUEBA)
    .setAudience(opciones.audiencia ?? CONFIG_PRUEBA.AUDIENCIA)
    .setIssuedAt(ahora - 300)
    .setExpirationTime(ahora + (opciones.venceEn ?? 300))
    .sign(clave);
}

/** Par de claves RSA generado en la prueba y un JWKS local con su clave pública. */
export async function crearClavesPrueba(): Promise<ClavesPrueba> {
  const propia = await generateKeyPair('RS256');
  const ajena = await generateKeyPair('RS256');
  const jwk = {
    ...(await exportJWK(propia.publicKey)),
    kid: KID,
    alg: 'RS256',
    use: 'sig',
  };
  return {
    jwks: createLocalJWKSet({ keys: [jwk] }),
    firmar: (opciones) => firmarCon(propia.privateKey, opciones),
    firmarConOtraClave: (opciones) => firmarCon(ajena.privateKey, opciones),
    firmarConRoles: (roles, azp = AZP.erp, opciones = {}) =>
      firmarCon(propia.privateKey, {
        ...opciones,
        payload: { ...opciones.payload, azp, realm_access: { roles } },
      }),
  };
}
