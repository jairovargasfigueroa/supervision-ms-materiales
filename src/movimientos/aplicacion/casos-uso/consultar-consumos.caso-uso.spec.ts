import { MovimientoRepositorioMemoria } from '../../../../test/utilidades/movimiento-memoria.js';
import { ObraAccesoRepositorioMemoria } from '../../../../test/utilidades/obra-acceso-memoria.js';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import { ObraAcceso } from '../../../acceso-obra/dominio/obra-acceso.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import type { Movimiento, TipoMovimiento } from '../../dominio/movimiento.js';
import { ConsultarConsumosCasoUso } from './consultar-consumos.caso-uso.js';

const OBRA = 'obra-1';
const residente = (id: string): UsuarioAutenticado => ({
  id,
  roles: ['residente'],
  azp: 'erp',
});

let secuencia = 0;
const movimiento = (
  tipo: TipoMovimiento,
  materialId: string,
  cantidad: number,
  periodo: string,
  partidaId: string | null,
  obraId = OBRA,
): Movimiento => ({
  id: `m-${++secuencia}`,
  obraId,
  materialId,
  tipo,
  cantidad,
  partidaId,
  ordenCompraId: null,
  periodo,
  cerrado: false,
  superaStock: false,
  registradoPor: 'almacenero-1',
  registradoEn: new Date('2026-11-15T10:00:00Z'),
  notaRemision: null,
});

describe('ConsultarConsumosCasoUso', () => {
  let movimientos: MovimientoRepositorioMemoria;
  let caso: ConsultarConsumosCasoUso;

  beforeEach(async () => {
    const obras = new ObraAccesoRepositorioMemoria();
    movimientos = new MovimientoRepositorioMemoria();
    caso = new ConsultarConsumosCasoUso(
      new AccesoObraServicio(obras),
      movimientos,
    );
    await obras.guardar(
      new ObraAcceso(
        OBRA,
        'Edificio Las Palmas',
        {
          residenteId: 'residente-1',
          maestroId: 'maestro-1',
          almaceneroId: 'almacenero-1',
          clienteId: 'cliente-1',
        },
        new Date(),
      ),
    );
  });

  it('suma solo las salidas del periodo, por partida y material', async () => {
    for (const m of [
      movimiento('SALIDA', 'cemento', 0.1, '2026-11', 'partida-a'),
      movimiento('SALIDA', 'cemento', 0.2, '2026-11', 'partida-a'),
      movimiento('SALIDA', 'acero', 5, '2026-11', 'partida-a'),
      movimiento('SALIDA', 'cemento', 2, '2026-11', 'partida-b'),
      movimiento('INGRESO', 'cemento', 100, '2026-11', null),
      movimiento('SALIDA', 'cemento', 7, '2026-10', 'partida-a'),
      movimiento('SALIDA', 'cemento', 9, '2026-11', 'partida-a', 'otra-obra'),
    ]) {
      await movimientos.crear(m);
    }
    expect(
      await caso.ejecutar(OBRA, '2026-11', residente('residente-1')),
    ).toEqual([
      { partidaId: 'partida-a', materialId: 'acero', cantidad: 5 },
      { partidaId: 'partida-a', materialId: 'cemento', cantidad: 0.3 },
      { partidaId: 'partida-b', materialId: 'cemento', cantidad: 2 },
    ]);
  });

  it('sin salidas en el periodo → lista vacía', async () => {
    await movimientos.crear(
      movimiento('INGRESO', 'cemento', 100, '2026-11', null),
    );
    expect(
      await caso.ejecutar(OBRA, '2026-11', residente('residente-1')),
    ).toEqual([]);
  });

  it('quien no ve la obra → 404 OBRA_NO_ENCONTRADA', async () => {
    await expect(
      caso.ejecutar(OBRA, '2026-11', residente('residente-2')),
    ).rejects.toMatchObject({ codigo: 'OBRA_NO_ENCONTRADA', status: 404 });
    await expect(
      caso.ejecutar('sin-obra', '2026-11', residente('residente-1')),
    ).rejects.toMatchObject({ codigo: 'OBRA_NO_ENCONTRADA', status: 404 });
  });
});
