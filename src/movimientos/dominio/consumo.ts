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

/**
 * Salidas de un material hacia una partida de una obra en un periodo, con cuántas fueron y cuántas
 * superaron el stock que había (herramienta MCP `consumos_partida`, 501; por lote de obras, 505).
 * `cantidad` es la misma suma que `ConsumoPartida`.
 */
export interface ResumenSalidasPartida extends ConsumoPartida {
  readonly obraId: string;
  /** Número de salidas. */
  readonly salidas: number;
  /** Salidas con `supera_stock` (alerta de 004). */
  readonly salidasSuperanStock: number;
}
