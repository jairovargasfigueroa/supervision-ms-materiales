import type { StockObra } from '../../dominio/stock-obra.js';

export const STOCK_REPOSITORIO = Symbol('STOCK_REPOSITORIO');

/** Cómo estaba la fila de stock antes de un cambio y cómo quedó. */
export interface CambioStock {
  /** `null` si la fila no existía. */
  anterior: StockObra | null;
  actual: StockObra;
}

/**
 * La fila de stock cambió entre que se leyó y se escribió (otro movimiento sobre el mismo material
 * a la vez): la `version` ya no es la leída. Quien ajusta vuelve a intentar desde el principio.
 */
export class StockCambiadoError extends Error {
  constructor(
    readonly obraId: string,
    readonly materialId: string,
  ) {
    super(
      `El stock de ${materialId} en ${obraId} cambió mientras se ajustaba.`,
    );
    this.name = 'StockCambiadoError';
  }
}

export interface StockRepositorio {
  /** Las filas de stock de la obra (materiales con movimientos o mínimo). */
  listarPorObra(obraId: string): Promise<StockObra[]>;
  /** Las filas de stock de varias obras a la vez, en cualquier orden (resumen del tablero, 009). */
  listarPorObras(obraIds: readonly string[]): Promise<StockObra[]>;
  /** La fila del material en la obra, o `null` si no tiene. */
  buscar(obraId: string, materialId: string): Promise<StockObra | null>;
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
  /**
   * Suma `ajuste` (negativo en una salida) a la cantidad, con control de versión: escribe solo si
   * la `version` sigue siendo la leída y la sube en 1; si no, `StockCambiadoError`. Si el material
   * no tenía fila en la obra, la crea con mínimo 0 (si otro la creó a la vez, `StockCambiadoError`).
   */
  ajustar(
    obraId: string,
    materialId: string,
    ajuste: number,
    ahora: Date,
  ): Promise<CambioStock>;
}
