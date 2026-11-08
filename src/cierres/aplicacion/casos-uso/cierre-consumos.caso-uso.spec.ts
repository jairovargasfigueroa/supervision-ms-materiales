import {
  CierrePeriodoRepositorioMemoria,
  MovimientoRepositorioMemoria,
  MovimientosPeriodoRepositorioMemoria,
} from '../../../../test/utilidades/movimiento-memoria.js';
import type { Outbox } from '../../../compartido/infraestructura/mensajeria/outbox.js';
import type { Transaccion } from '../../../compartido/infraestructura/mongo/transaccion.js';
import type { Movimiento } from '../../../movimientos/dominio/movimiento.js';
import { CerrarConsumosCasoUso } from './cerrar-consumos.caso-uso.js';
import { ReabrirConsumosCasoUso } from './reabrir-consumos.caso-uso.js';

const OBRA = 'obra-1';
const SAGA = '6f1c2d3e-0000-4000-8000-000000000001';
const entrada = (planillaId = 'planilla-1', periodo = '2026-11') => ({
  planillaId,
  obraId: OBRA,
  periodo,
});

const transaccionDirecta = {
  ejecutar: <T>(trabajo: () => Promise<T>) => trabajo(),
} as unknown as Transaccion;

/** Outbox en memoria: guarda lo que se agregó. */
class OutboxMemoria {
  readonly agregados: {
    tipo: string;
    datos: Record<string, unknown>;
    correlacionId?: string;
  }[] = [];
  agregar(
    tipo: string,
    datos: Record<string, unknown>,
    correlacionId?: string,
  ) {
    this.agregados.push({ tipo, datos, correlacionId });
    return Promise.resolve();
  }
}

const movimiento = (
  id: string,
  cambios: Partial<Movimiento> = {},
): Movimiento =>
  ({
    id,
    obraId: OBRA,
    materialId: 'cemento',
    tipo: 'SALIDA',
    cantidad: 5,
    partidaId: 'partida-1',
    periodo: '2026-11',
    cerrado: false,
    superaStock: false,
    registradoPor: 'almacenero-1',
    registradoEn: new Date('2026-11-10T14:00:00Z'),
    notaRemision: null,
    ...cambios,
  }) as Movimiento;

describe('Cierre de consumos (CerrarConsumos y ReabrirConsumos)', () => {
  let cierres: CierrePeriodoRepositorioMemoria;
  let movimientos: MovimientoRepositorioMemoria;
  let outbox: OutboxMemoria;
  let cerrar: CerrarConsumosCasoUso;
  let reabrir: ReabrirConsumosCasoUso;

  beforeEach(() => {
    cierres = new CierrePeriodoRepositorioMemoria();
    movimientos = new MovimientoRepositorioMemoria();
    outbox = new OutboxMemoria();
    const marcador = new MovimientosPeriodoRepositorioMemoria(movimientos);
    const salida = outbox as unknown as Outbox;
    cerrar = new CerrarConsumosCasoUso(
      cierres,
      marcador,
      transaccionDirecta,
      salida,
    );
    reabrir = new ReabrirConsumosCasoUso(
      cierres,
      marcador,
      transaccionDirecta,
      salida,
    );
    for (const m of [
      movimiento('m1'),
      movimiento('m2', { tipo: 'INGRESO', partidaId: null }),
      movimiento('m3', { periodo: '2026-10' }),
      movimiento('m4', { obraId: 'obra-2' }),
    ]) {
      movimientos.movimientos.set(m.id, m);
    }
  });

  const cerrados = () =>
    [...movimientos.movimientos.values()]
      .filter((m) => m.cerrado)
      .map((m) => m.id)
      .sort();

  describe('CerrarConsumos', () => {
    it('cierra el periodo, marca sus movimientos y responde ConsumosCerrados', async () => {
      expect(await cerrar.ejecutar(entrada(), SAGA)).toBe('CERRAR');

      expect(await cierres.buscar(OBRA, '2026-11')).toMatchObject({
        planillaId: 'planilla-1',
        estado: 'CERRADO',
      });
      expect(cerrados()).toEqual(['m1', 'm2']);
      expect(outbox.agregados).toEqual([
        {
          tipo: 'ConsumosCerrados',
          datos: { planillaId: 'planilla-1', obraId: OBRA, periodo: '2026-11' },
          correlacionId: SAGA,
        },
      ]);
    });

    it('repetido por la misma planilla responde igual sin cambiar el cierre', async () => {
      await cerrar.ejecutar(entrada(), SAGA);
      const primero = await cierres.buscar(OBRA, '2026-11');

      expect(await cerrar.ejecutar(entrada(), SAGA)).toBe('YA_CERRADO');

      expect(await cierres.buscar(OBRA, '2026-11')).toEqual(primero);
      expect(outbox.agregados.map((a) => a.tipo)).toEqual([
        'ConsumosCerrados',
        'ConsumosCerrados',
      ]);
    });

    it('cerrado por otra planilla responde CierreFallido con el periodo real', async () => {
      await cerrar.ejecutar(entrada('planilla-1'), SAGA);
      outbox.agregados.length = 0;

      expect(await cerrar.ejecutar(entrada('planilla-2'), SAGA)).toBe(
        'CERRADO_POR_OTRA',
      );

      expect(await cierres.buscar(OBRA, '2026-11')).toMatchObject({
        planillaId: 'planilla-1',
        estado: 'CERRADO',
      });
      expect(outbox.agregados).toEqual([
        {
          tipo: 'CierreFallido',
          datos: {
            planillaId: 'planilla-2',
            motivo:
              'Los consumos del periodo 2026-11 ya fueron cerrados por otra planilla',
          },
          correlacionId: SAGA,
        },
      ]);
    });

    it('un periodo reabierto lo puede cerrar otra planilla', async () => {
      await cerrar.ejecutar(entrada('planilla-1'), SAGA);
      await reabrir.ejecutar(entrada('planilla-1'), SAGA);

      expect(await cerrar.ejecutar(entrada('planilla-2'), SAGA)).toBe('CERRAR');

      expect(await cierres.buscar(OBRA, '2026-11')).toMatchObject({
        planillaId: 'planilla-2',
        estado: 'CERRADO',
      });
      expect(cerrados()).toEqual(['m1', 'm2']);
    });
  });

  describe('ReabrirConsumos', () => {
    it('reabre el periodo, desmarca sus movimientos y responde ConsumosReabiertos', async () => {
      await cerrar.ejecutar(entrada(), SAGA);
      outbox.agregados.length = 0;

      expect(await reabrir.ejecutar(entrada(), SAGA)).toBe('REABRIR');

      expect(await cierres.buscar(OBRA, '2026-11')).toMatchObject({
        planillaId: 'planilla-1',
        estado: 'REABIERTO',
      });
      expect(cerrados()).toEqual([]);
      expect(outbox.agregados).toEqual([
        {
          tipo: 'ConsumosReabiertos',
          datos: { planillaId: 'planilla-1', obraId: OBRA, periodo: '2026-11' },
          correlacionId: SAGA,
        },
      ]);
    });

    it('es idempotente: repetido o sin cierre responde igual sin cambios', async () => {
      expect(await reabrir.ejecutar(entrada(), SAGA)).toBe('YA_REABIERTO');
      expect(await cierres.buscar(OBRA, '2026-11')).toBeNull();

      await cerrar.ejecutar(entrada(), SAGA);
      await reabrir.ejecutar(entrada(), SAGA);
      expect(await reabrir.ejecutar(entrada(), SAGA)).toBe('YA_REABIERTO');

      expect(await cierres.buscar(OBRA, '2026-11')).toMatchObject({
        estado: 'REABIERTO',
      });
      expect(outbox.agregados.map((a) => a.tipo)).toEqual([
        'ConsumosReabiertos',
        'ConsumosCerrados',
        'ConsumosReabiertos',
        'ConsumosReabiertos',
      ]);
    });

    it('no reabre el cierre de otra planilla ni publica', async () => {
      await cerrar.ejecutar(entrada('planilla-1'), SAGA);
      outbox.agregados.length = 0;

      expect(await reabrir.ejecutar(entrada('planilla-2'), SAGA)).toBe(
        'DE_OTRA_PLANILLA',
      );

      expect(await cierres.buscar(OBRA, '2026-11')).toMatchObject({
        planillaId: 'planilla-1',
        estado: 'CERRADO',
      });
      expect(cerrados()).toEqual(['m1', 'm2']);
      expect(outbox.agregados).toEqual([]);
    });
  });
});
