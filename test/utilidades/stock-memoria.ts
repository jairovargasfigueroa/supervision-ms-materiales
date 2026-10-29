import type {
  CambioStock,
  StockRepositorio,
} from '../../src/stock/aplicacion/puertos/stock.repositorio.js';
import { sumarCantidades } from '../../src/compartido/dominio/cantidad.js';
import { StockObra } from '../../src/stock/dominio/stock-obra.js';

/** Repositorio de `stock_obra` en memoria para las pruebas unitarias. */
export class StockRepositorioMemoria implements StockRepositorio {
  readonly filas = new Map<string, StockObra>();

  /** Deja una fila como si la hubieran escrito los movimientos (004). */
  poner(obraId: string, materialId: string, cantidad: number, minimo = 0) {
    this.filas.set(
      `${obraId}:${materialId}`,
      new StockObra(obraId, materialId, cantidad, minimo, 1, new Date()),
    );
  }

  listarPorObra(obraId: string): Promise<StockObra[]> {
    return Promise.resolve(
      [...this.filas.values()].filter((f) => f.obraId === obraId),
    );
  }

  buscar(obraId: string, materialId: string): Promise<StockObra | null> {
    return Promise.resolve(this.filas.get(`${obraId}:${materialId}`) ?? null);
  }

  fijarMinimo(
    obraId: string,
    materialId: string,
    minimo: number,
    ahora: Date,
  ): Promise<CambioStock> {
    const clave = `${obraId}:${materialId}`;
    const anterior = this.filas.get(clave) ?? null;
    const actual = new StockObra(
      obraId,
      materialId,
      anterior?.cantidad ?? 0,
      minimo,
      (anterior?.version ?? 0) + 1,
      ahora,
    );
    this.filas.set(clave, actual);
    return Promise.resolve({ anterior, actual });
  }

  ajustar(
    obraId: string,
    materialId: string,
    ajuste: number,
    ahora: Date,
  ): Promise<CambioStock> {
    const clave = `${obraId}:${materialId}`;
    const anterior = this.filas.get(clave) ?? null;
    const actual = new StockObra(
      obraId,
      materialId,
      sumarCantidades(anterior?.cantidad ?? 0, ajuste),
      anterior?.minimo ?? 0,
      (anterior?.version ?? 0) + 1,
      ahora,
    );
    this.filas.set(clave, actual);
    return Promise.resolve({ anterior, actual });
  }
}
