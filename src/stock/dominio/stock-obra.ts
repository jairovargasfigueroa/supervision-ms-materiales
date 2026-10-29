import { aMilesimas } from '../../compartido/dominio/cantidad.js';

/** Estado del stock de un material en una obra (reglas del negocio, «Material y stock»). */
export type EstadoStock = 'BAJO' | 'JUSTO' | 'OK';

/**
 * `BAJO` si cantidad < mínimo; `JUSTO` si mínimo ≤ cantidad ≤ 1,25 × mínimo; `OK` si
 * cantidad > 1,25 × mínimo (decisión del equipo). Se calcula al leer, no se guarda.
 *
 * Se compara en milésimas enteras: cantidad ≤ 1,25 × mínimo ⇔ 4 × cantidad ≤ 5 × mínimo.
 */
export function calcularEstado(cantidad: number, minimo: number): EstadoStock {
  const c = aMilesimas(cantidad);
  const m = aMilesimas(minimo);
  if (c < m) return 'BAJO';
  if (4 * c <= 5 * m) return 'JUSTO';
  return 'OK';
}

/**
 * Stock de un material en una obra (`stock_obra`). La cantidad se recalcula con los movimientos
 * (004), nunca se escribe a mano; el mínimo lo fija administración (003).
 */
export class StockObra {
  constructor(
    readonly obraId: string,
    readonly materialId: string,
    readonly cantidad: number,
    readonly minimo: number,
    readonly version: number,
    readonly actualizadoEn: Date,
  ) {}

  get estado(): EstadoStock {
    return calcularEstado(this.cantidad, this.minimo);
  }
}

/** Materiales en estado `BAJO` de una obra (resumen del tablero, 009). */
export interface ResumenStockObra {
  obraId: string;
  materialesBajos: number;
}

/**
 * Cuántos materiales están `BAJO` en cada obra pedida (estado calculado al leer). Una obra sin
 * filas de stock, o sin ninguna `BAJO`, cuenta 0. Mismo orden que `obraIds`; las filas de otras
 * obras se ignoran.
 */
export function resumirStock(
  obraIds: readonly string[],
  filas: readonly StockObra[],
): ResumenStockObra[] {
  const bajos = new Map<string, number>(obraIds.map((id) => [id, 0]));
  for (const fila of filas) {
    const actual = bajos.get(fila.obraId);
    if (actual !== undefined && fila.estado === 'BAJO') {
      bajos.set(fila.obraId, actual + 1);
    }
  }
  return [...bajos].map(([obraId, materialesBajos]) => ({
    obraId,
    materialesBajos,
  }));
}

/**
 * «Stock bajo» se avisa cuando el stock cruza el mínimo: queda `BAJO` y antes no lo estaba
 * (o no había fila de stock). Si ya estaba bajo no se vuelve a avisar (004, diseño, paso 6).
 */
export function cruzaAlBajo(
  anterior: StockObra | null,
  actual: StockObra,
): boolean {
  return actual.estado === 'BAJO' && anterior?.estado !== 'BAJO';
}
