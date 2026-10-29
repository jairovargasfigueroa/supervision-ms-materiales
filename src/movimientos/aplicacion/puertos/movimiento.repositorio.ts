import type { Movimiento } from '../../dominio/movimiento.js';

export const MOVIMIENTO_REPOSITORIO = Symbol('MOVIMIENTO_REPOSITORIO');

/**
 * Ya hay un movimiento con ese `id` (otro envío del mismo registro llegó primero). El caso de uso
 * lo trata como un envío repetido: devuelve el existente.
 */
export class MovimientoRepetidoError extends Error {
  constructor(readonly id: string) {
    super(`Ya existe el movimiento ${id}.`);
    this.name = 'MovimientoRepetidoError';
  }
}

export interface MovimientoRepositorio {
  buscar(id: string): Promise<Movimiento | null>;
  /** Inserta el movimiento; si el `id` ya existe, `MovimientoRepetidoError`. */
  crear(movimiento: Movimiento): Promise<void>;
}
