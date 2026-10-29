import type { CierrePeriodo } from '../../dominio/cierre-periodo.js';

export const CIERRE_PERIODO_REPOSITORIO = Symbol('CIERRE_PERIODO_REPOSITORIO');

export interface CierrePeriodoRepositorio {
  /** `true` si el periodo (`AAAA-MM`) de la obra está `CERRADO` (no si se reabrió). */
  estaCerrado(obraId: string, periodo: string): Promise<boolean>;
  /** El cierre de la obra en ese periodo, o `null` si nunca se cerró. */
  buscar(obraId: string, periodo: string): Promise<CierrePeriodo | null>;
  /** Crea o reemplaza el cierre de la obra en ese periodo (uno solo por obra y periodo). */
  guardar(cierre: CierrePeriodo): Promise<void>;
}
