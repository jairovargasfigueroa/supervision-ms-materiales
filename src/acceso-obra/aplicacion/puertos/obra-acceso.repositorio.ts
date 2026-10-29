import type { ObraAcceso } from '../../dominio/obra-acceso.js';

export const OBRA_ACCESO_REPOSITORIO = Symbol('OBRA_ACCESO_REPOSITORIO');

export interface ObraAccesoRepositorio {
  /** Crea o reemplaza la copia de la obra (por `obraId`). */
  guardar(obra: ObraAcceso): Promise<void>;
  buscar(obraId: string): Promise<ObraAcceso | null>;
  /** Las obras de esa lista que existan (en cualquier orden). */
  buscarVarias(obraIds: readonly string[]): Promise<ObraAcceso[]>;
}
