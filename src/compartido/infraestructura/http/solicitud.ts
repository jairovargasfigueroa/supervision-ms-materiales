import type { Request } from 'express';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';

/** Petición HTTP con lo que agregan el middleware de `X-Request-Id` y el guardia del token. */
export type Solicitud = Request & {
  requestId?: string;
  usuario?: UsuarioAutenticado;
};
