import type { StockObra } from '../../dominio/stock-obra.js';

export const STOCK_REPOSITORIO = Symbol('STOCK_REPOSITORIO');

/** Cómo estaba la fila de stock antes de un cambio y cómo quedó. */
export interface CambioStock {
  /** `null` si la fila no existía. */
  anterior: StockObra | null;
  actual: StockObra;
}

export interface StockRepositorio {
  /** Las filas de stock de la obra (materiales con movimientos o mínimo). */
  listarPorObra(obraId: string): Promise<StockObra[]>;
  /**
   * *Upsert* del mínimo en una sola operación: si la fila no existe la crea con cantidad 0
   * (003, criterio 7). Sube la `version`.
   */
  fijarMinimo(
    obraId: string,
    materialId: string,
    minimo: number,
    ahora: Date,
  ): Promise<CambioStock>;
}
