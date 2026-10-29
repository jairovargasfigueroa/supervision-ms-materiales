import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Solicitud } from '../http/solicitud.js';
import { ES_PUBLICO } from './publico.decorator.js';
import { ROLES } from './roles.decorator.js';
import { rolesEfectivos } from './roles-efectivos.js';

/**
 * Guardia global que va después de `JwtGuard`: si la ruta tiene `@Roles(...)`, exige que el
 * usuario ya autenticado tenga uno de esos roles (los que cuentan según `azp`). Si no, responde
 * `403 SIN_PERMISO`. Las rutas `@Publico()` y las que no tienen `@Roles()` no se revisan aquí.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos)) {
      return true;
    }
    const permitidos = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES,
      objetivos,
    );
    if (!permitidos) return true;

    const { usuario } = contexto.switchToHttp().getRequest<Solicitud>();
    if (!usuario) {
      // No debería pasar: JwtGuard corre antes y deja el usuario.
      throw new UnauthorizedException({
        codigo: 'NO_AUTENTICADO',
        detail: 'Falta el token de acceso.',
      });
    }
    const roles = rolesEfectivos(usuario.roles, usuario.azp);
    if (!roles.some((rol) => permitidos.includes(rol))) {
      throw new ForbiddenException({
        codigo: 'SIN_PERMISO',
        detail: 'Tu rol no permite esta acción.',
      });
    }
    return true;
  }
}
