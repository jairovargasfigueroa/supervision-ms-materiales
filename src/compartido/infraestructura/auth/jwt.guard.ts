import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Solicitud } from '../http/solicitud.js';
import { ES_PUBLICO } from './publico.decorator.js';
import { TokenInvalidoError, ValidadorToken } from './validador-token.js';

/**
 * Guardia global: exige un token válido de Keycloak en toda ruta que no tenga `@Publico()`
 * y deja el usuario en la petición. Solo autentica; los roles los revisa `RolesGuard` (001).
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly validador: ValidadorToken,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (esPublico) return true;

    const solicitud = contexto.switchToHttp().getRequest<Solicitud>();
    solicitud.usuario = await autenticar(this.validador, solicitud);
    return true;
  }
}

/** Valida el encabezado `Authorization`; si no sirve, lanza `401 NO_AUTENTICADO`. */
export async function autenticar(
  validador: ValidadorToken,
  solicitud: Solicitud,
) {
  try {
    return await validador.validar(solicitud.headers.authorization);
  } catch (error) {
    if (error instanceof TokenInvalidoError) {
      throw new UnauthorizedException({
        codigo: 'NO_AUTENTICADO',
        detail: error.message,
      });
    }
    throw error;
  }
}
