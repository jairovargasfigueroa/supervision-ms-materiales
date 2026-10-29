import type { CierrePeriodoRepositorio } from '../../src/cierres/aplicacion/puertos/cierre-periodo.repositorio.js';
import type {
  CriteriosPagina,
  Pagina,
} from '../../src/compartido/dominio/paginacion.js';
import {
  type FiltroMovimientos,
  MovimientoRepetidoError,
  type MovimientoRepositorio,
  type OrdenMovimiento,
} from '../../src/movimientos/aplicacion/puertos/movimiento.repositorio.js';
import { sumarCantidades } from '../../src/compartido/dominio/cantidad.js';
import type { ConsumoPartida } from '../../src/movimientos/dominio/consumo.js';
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

  listar(
    obraId: string,
    filtro: FiltroMovimientos,
    criterios: CriteriosPagina<OrdenMovimiento>,
  ): Promise<Pagina<Movimiento>> {
    const sentido = criterios.direccion === 'desc' ? -1 : 1;
    const todos = [...this.movimientos.values()]
      .filter((m) => m.obraId === obraId)
      .filter((m) => !filtro.periodo || m.periodo === filtro.periodo)
      .sort(
        (a, b) =>
          sentido * (a.registradoEn.getTime() - b.registradoEn.getTime()) ||
          sentido * a.id.localeCompare(b.id),
      );
    const inicio = (criterios.pagina - 1) * criterios.tamano;
    return Promise.resolve({
      items: todos.slice(inicio, inicio + criterios.tamano),
      total: todos.length,
      pagina: criterios.pagina,
      tamano: criterios.tamano,
    });
  }

  sumarSalidas(obraId: string, periodo: string): Promise<ConsumoPartida[]> {
    const sumas = new Map<string, ConsumoPartida>();
    for (const m of this.movimientos.values()) {
      if (m.obraId !== obraId || m.periodo !== periodo) continue;
      if (m.tipo !== 'SALIDA' || m.partidaId === null) continue;
      const clave = `${m.partidaId}\u0000${m.materialId}`;
      const previa = sumas.get(clave)?.cantidad ?? 0;
      sumas.set(clave, {
        partidaId: m.partidaId,
        materialId: m.materialId,
        cantidad: sumarCantidades(previa, m.cantidad),
      });
    }
    return Promise.resolve(
      [...sumas.values()].sort(
        (a, b) =>
          a.partidaId.localeCompare(b.partidaId) ||
          a.materialId.localeCompare(b.materialId),
      ),
    );
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
