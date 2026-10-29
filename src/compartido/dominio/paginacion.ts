import { ReglaNegocioError } from './regla-negocio.error.js';

/** Máximo de elementos por página (convenciones, «Listas y paginación»). */
export const TAMANO_MAXIMO = 100;
export const TAMANO_POR_DEFECTO = 20;

export type Direccion = 'asc' | 'desc';

/** Qué página pedir y en qué orden (`orden` es el campo en camelCase del JSON). */
export interface CriteriosPagina<O extends string = string> {
  /** Desde 1. */
  pagina: number;
  tamano: number;
  orden: O;
  direccion: Direccion;
}

/** Respuesta de una lista paginada: `{ items, total, pagina, tamano }`. */
export interface Pagina<T> {
  items: T[];
  total: number;
  pagina: number;
  tamano: number;
}

/** `tamano` mayor a 100 → `400 PAGINACION_INVALIDA` (convenciones). */
export function validarPaginacion(criterios: CriteriosPagina): void {
  if (criterios.tamano > TAMANO_MAXIMO) {
    throw new ReglaNegocioError(
      'PAGINACION_INVALIDA',
      `Se pueden pedir hasta ${TAMANO_MAXIMO} elementos por página.`,
      400,
    );
  }
}
