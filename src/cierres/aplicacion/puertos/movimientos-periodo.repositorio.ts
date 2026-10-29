export const MOVIMIENTOS_PERIODO_REPOSITORIO = Symbol(
  'MOVIMIENTOS_PERIODO_REPOSITORIO',
);

/** Lo que el cierre necesita de `movimiento`: marcar los del periodo como cerrados o abiertos. */
export interface MovimientosPeriodoRepositorio {
  /**
   * Pone `cerrado` en todos los movimientos (ingresos y salidas) de la obra en el periodo
   * (`AAAA-MM`). Devuelve cuántos cambiaron.
   */
  marcarCerrados(
    obraId: string,
    periodo: string,
    cerrado: boolean,
  ): Promise<number>;
}
