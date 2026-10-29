export const CIERRE_PERIODO_REPOSITORIO = Symbol('CIERRE_PERIODO_REPOSITORIO');

export interface CierrePeriodoRepositorio {
  /** `true` si el periodo (`AAAA-MM`) de la obra está `CERRADO` (no si se reabrió). */
  estaCerrado(obraId: string, periodo: string): Promise<boolean>;
}
