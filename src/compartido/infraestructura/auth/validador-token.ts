import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

/** Token de inyección del conjunto de claves (JWKS). En las pruebas se cambia por uno local. */
export const CONJUNTO_CLAVES = Symbol('CONJUNTO_CLAVES');

/** El token falta o no es válido: se responde `401 NO_AUTENTICADO`. */
export class TokenInvalidoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'TokenInvalidoError';
  }
}

/**
 * Valida el token de acceso de Keycloak: firma (JWKS del realm), vencimiento, emisor y audiencia
 * (convenciones, «Autenticación y permisos»). No registra el token.
 */
@Injectable()
export class ValidadorToken {
  private readonly emisor: string;
  private readonly audiencia: string;

  constructor(
    @Inject(CONJUNTO_CLAVES) private readonly claves: JWTVerifyGetKey,
    config: ConfigService,
  ) {
    const url = config.getOrThrow<string>('KEYCLOAK_URL').replace(/\/+$/, '');
    this.emisor = `${url}/realms/${config.getOrThrow<string>('KEYCLOAK_REALM')}`;
    this.audiencia = config.getOrThrow<string>('AUDIENCIA');
  }

  /** Recibe el encabezado `Authorization` y devuelve el usuario, o lanza `TokenInvalidoError`. */
  async validar(autorizacion: string | undefined): Promise<UsuarioAutenticado> {
    const [esquema, token] = (autorizacion ?? '').trim().split(/\s+/);
    if (!token || esquema.toLowerCase() !== 'bearer') {
      throw new TokenInvalidoError('Falta el token de acceso.');
    }
    try {
      const { payload } = await jwtVerify(token, this.claves, {
        issuer: this.emisor,
        audience: this.audiencia,
      });
      if (typeof payload.sub !== 'string' || payload.sub === '') {
        throw new TokenInvalidoError('El token no identifica al usuario.');
      }
      const accesoRealm = payload.realm_access as
        { roles?: unknown } | undefined;
      const roles = Array.isArray(accesoRealm?.roles)
        ? accesoRealm.roles.filter(
            (rol): rol is string => typeof rol === 'string',
          )
        : [];
      const azp = typeof payload.azp === 'string' ? payload.azp : undefined;
      return { id: payload.sub, roles, azp };
    } catch (error) {
      if (error instanceof TokenInvalidoError) throw error;
      // Keycloak no respondió al pedir el JWKS: 503 y no 401, para que el ERP no cierre la sesión (convenciones)
      if (esFallaAlObtenerClaves(error)) {
        throw new ServiceUnavailableException({
          codigo: 'SERVICIO_NO_DISPONIBLE',
          detail: 'No se pudo validar el token: Keycloak no responde.',
        });
      }
      if (error instanceof errors.JWTExpired) {
        throw new TokenInvalidoError('El token venció.');
      }
      if (error instanceof errors.JOSEError) {
        throw new TokenInvalidoError('El token no es válido.');
      }
      throw new TokenInvalidoError('No se pudo validar el token.');
    }
  }
}

/** Error de red, tiempo agotado o respuesta distinta de 200 al pedir el JWKS (no es culpa del token). */
export function esFallaAlObtenerClaves(error: unknown): boolean {
  if (error instanceof errors.JWKSTimeout) return true;
  if (error instanceof errors.JOSEError) {
    return error.message.startsWith(
      'Expected 200 OK from the JSON Web Key Set',
    );
  }
  return error instanceof Error;
}
