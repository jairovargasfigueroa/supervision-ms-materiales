import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ES_PUBLICO } from './publico.decorator.js';
import { ROLES } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

function contexto(
  metadatos: Record<string, unknown>,
  usuario?: UsuarioAutenticado,
): ExecutionContext {
  const manejador = () => undefined;
  for (const [clave, valor] of Object.entries(metadatos)) {
    Reflect.defineMetadata(clave, valor, manejador);
  }
  return {
    getHandler: () => manejador,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ usuario }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guardia = new RolesGuard(new Reflector());
  const residente: UsuarioAutenticado = {
    id: 'u1',
    roles: ['residente'],
    azp: 'erp',
  };

  it('deja pasar una ruta sin @Roles()', () => {
    expect(guardia.canActivate(contexto({}, residente))).toBe(true);
  });

  it('deja pasar una ruta pública sin usuario', () => {
    expect(
      guardia.canActivate(contexto({ [ES_PUBLICO]: true, [ROLES]: ['admin'] })),
    ).toBe(true);
  });

  it('deja pasar si el usuario tiene uno de los roles', () => {
    expect(
      guardia.canActivate(
        contexto({ [ROLES]: ['admin', 'residente'] }, residente),
      ),
    ).toBe(true);
  });

  it('responde 403 SIN_PERMISO si no tiene ninguno de los roles', () => {
    expect(() =>
      guardia.canActivate(
        contexto({ [ROLES]: ['admin', 'gerente'] }, residente),
      ),
    ).toThrow(ForbiddenException);
  });

  it('usa los roles que cuentan según azp', () => {
    const demo: UsuarioAutenticado = {
      id: 'u2',
      roles: ['residente', 'cliente'],
      azp: 'portal',
    };
    expect(guardia.canActivate(contexto({ [ROLES]: ['cliente'] }, demo))).toBe(
      true,
    );
    expect(() =>
      guardia.canActivate(contexto({ [ROLES]: ['residente'] }, demo)),
    ).toThrow(ForbiddenException);
  });

  it('responde 401 si no hay usuario autenticado', () => {
    expect(() => guardia.canActivate(contexto({ [ROLES]: ['admin'] }))).toThrow(
      UnauthorizedException,
    );
  });
});
