import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Solicitud } from '../http/solicitud.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

/**
 * Parámetro del controlador con el usuario del token ya validado por `JwtGuard`
 * (`@UsuarioActual() usuario: UsuarioAutenticado`). Para decidir por rol, usar
 * `rolesEfectivos(usuario.roles, usuario.azp)`.
 */
export const UsuarioActual = createParamDecorator(
  (
    _dato: unknown,
    contexto: ExecutionContext,
  ): UsuarioAutenticado | undefined =>
    contexto.switchToHttp().getRequest<Solicitud>().usuario,
);
