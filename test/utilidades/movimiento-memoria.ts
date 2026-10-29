import type { CierrePeriodoRepositorio } from '../../src/cierres/aplicacion/puertos/cierre-periodo.repositorio.js';
import type { MovimientosPeriodoRepositorio } from '../../src/cierres/aplicacion/puertos/movimientos-periodo.repositorio.js';
import type { CierrePeriodo } from '../../src/cierres/dominio/cierre-periodo.js';
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

/** `cierre_periodo` en memoria, por obra y periodo (`obraId:periodo`). */
export class CierrePeriodoRepositorioMemoria implements CierrePeriodoRepositorio {
  readonly cierres = new Map<string, CierrePeriodo>();

  /** Atajo de las pruebas: deja el periodo `CERRADO` por una planilla cualquiera. */
  cerrar(obraId: string, periodo: string, planillaId = 'planilla-x'): void {
    this.cierres.set(`${obraId}:${periodo}`, {
      obraId,
      periodo,
      planillaId,
      estado: 'CERRADO',
      cerradoEn: new Date(),
    });
  }

  estaCerrado(obraId: string, periodo: string): Promise<boolean> {
    return Promise.resolve(
      this.cierres.get(`${obraId}:${periodo}`)?.estado === 'CERRADO',
    );
  }

  buscar(obraId: string, periodo: string): Promise<CierrePeriodo | null> {
    const cierre = this.cierres.get(`${obraId}:${periodo}`);
    return Promise.resolve(cierre ? { ...cierre } : null);
  }

  guardar(cierre: CierrePeriodo): Promise<void> {
    this.cierres.set(`${cierre.obraId}:${cierre.periodo}`, { ...cierre });
    return Promise.resolve();
  }
}

/** Lo que el cierre marca en `movimiento`, en memoria: `cerrado` por obra y periodo. */
export class MovimientosPeriodoRepositorioMemoria implements MovimientosPeriodoRepositorio {
  readonly marcas: { obraId: string; periodo: string; cerrado: boolean }[] = [];

  constructor(private readonly movimientos?: MovimientoRepositorioMemoria) {}

  marcarCerrados(
    obraId: string,
    periodo: string,
    cerrado: boolean,
  ): Promise<number> {
    this.marcas.push({ obraId, periodo, cerrado });
    let cambiados = 0;
    for (const [id, m] of this.movimientos?.movimientos ?? []) {
      if (m.obraId !== obraId || m.periodo !== periodo) continue;
      if (m.cerrado === cerrado) continue;
      this.movimientos?.movimientos.set(id, { ...m, cerrado } as Movimiento);
      cambiados++;
    }
    return Promise.resolve(cambiados);
  }
}
