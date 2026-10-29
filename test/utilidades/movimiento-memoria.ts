import type { CierrePeriodoRepositorio } from '../../src/cierres/aplicacion/puertos/cierre-periodo.repositorio.js';
import {
  MovimientoRepetidoError,
  type MovimientoRepositorio,
} from '../../src/movimientos/aplicacion/puertos/movimiento.repositorio.js';
import type { Movimiento } from '../../src/movimientos/dominio/movimiento.js';

/** Repositorio de `movimiento` en memoria para las pruebas unitarias (`id` único). */
export class MovimientoRepositorioMemoria implements MovimientoRepositorio {
  readonly movimientos = new Map<string, Movimiento>();

  buscar(id: string): Promise<Movimiento | null> {
    return Promise.resolve(this.movimientos.get(id) ?? null);
  }

  crear(movimiento: Movimiento): Promise<void> {
    if (this.movimientos.has(movimiento.id)) {
      return Promise.reject(new MovimientoRepetidoError(movimiento.id));
    }
    this.movimientos.set(movimiento.id, movimiento);
    return Promise.resolve();
  }
}

/** `cierre_periodo` en memoria: los periodos cerrados por obra (`obraId:periodo`). */
export class CierrePeriodoRepositorioMemoria implements CierrePeriodoRepositorio {
  readonly cerrados = new Set<string>();

  cerrar(obraId: string, periodo: string): void {
    this.cerrados.add(`${obraId}:${periodo}`);
  }

  estaCerrado(obraId: string, periodo: string): Promise<boolean> {
    return Promise.resolve(this.cerrados.has(`${obraId}:${periodo}`));
  }
}
