/**
 * Material usado en una partida durante un periodo (006): la suma de las **salidas** de ese
 * material hacia esa partida. Los ingresos no cuentan. Se compara con el material previsto que
 * calcula Obras (`material-previsto`) en el gateway.
 */
export interface ConsumoPartida {
  readonly partidaId: string;
  readonly materialId: string;
  /** Suma de las salidas, con 3 decimales. */
  readonly cantidad: number;
}
