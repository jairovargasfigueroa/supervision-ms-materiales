import { MovimientoRepositorioMemoria } from '../../../../test/utilidades/movimiento-memoria.js';
import { ObraAccesoRepositorioMemoria } from '../../../../test/utilidades/obra-acceso-memoria.js';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import { ObraAcceso } from '../../../acceso-obra/dominio/obra-acceso.js';
import type { CriteriosPagina } from '../../../compartido/dominio/paginacion.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import type { Movimiento } from '../../dominio/movimiento.js';
import type { OrdenMovimiento } from '../puertos/movimiento.repositorio.js';
import { ListarMovimientosCasoUso } from './listar-movimientos.caso-uso.js';

const OBRA = 'obra-1';
const residente = (id: string): UsuarioAutenticado => ({
  id,
  roles: ['residente'],
  azp: 'erp',
});
const criterios = (
  cambios: Partial<CriteriosPagina<OrdenMovimiento>> = {},
): CriteriosPagina<OrdenMovimiento> => ({
  pagina: 1,
  tamano: 20,
  orden: 'registradoEn',
  direccion: 'desc',
  ...cambios,
});

const movimiento = (
  id: string,
  registradoEn: string,
  periodo: string,
  obraId = OBRA,
): Movimiento => ({
  id,
  obraId,
  materialId: 'cemento',
  tipo: 'INGRESO',
  cantidad: 1,
  partidaId: null,
  ordenCompraId: null,
  periodo,
  cerrado: false,
  superaStock: false,
  registradoPor: 'almacenero-1',
  registradoEn: new Date(registradoEn),
  notaRemision: null,
});

describe('ListarMovimientosCasoUso', () => {
  let movimientos: MovimientoRepositorioMemoria;
  let caso: ListarMovimientosCasoUso;

  beforeEach(async () => {
    const obras = new ObraAccesoRepositorioMemoria();
    movimientos = new MovimientoRepositorioMemoria();
    caso = new ListarMovimientosCasoUso(
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
    for (const m of [
      movimiento('a', '2026-10-20T10:00:00Z', '2026-10'),
      movimiento('b', '2026-11-02T10:00:00Z', '2026-11'),
      movimiento('c', '2026-11-15T10:00:00Z', '2026-11'),
      movimiento('d', '2026-11-16T10:00:00Z', '2026-11', 'otra-obra'),
    ]) {
      await movimientos.crear(m);
    }
  });

  it('lista los de la obra, del más reciente al más antiguo, y filtra por periodo', async () => {
    const todos = await caso.ejecutar(
      OBRA,
      {},
      criterios(),
      residente('residente-1'),
    );
    expect(todos.items.map((m) => m.id)).toEqual(['c', 'b', 'a']);
    expect(todos.total).toBe(3);

    const noviembre = await caso.ejecutar(
      OBRA,
      { periodo: '2026-11' },
      criterios({ tamano: 1, pagina: 2 }),
      residente('residente-1'),
    );
    expect(noviembre).toMatchObject({ total: 2, pagina: 2, tamano: 1 });
    expect(noviembre.items.map((m) => m.id)).toEqual(['b']);
  });

  it('tamano mayor a 100 → 400 PAGINACION_INVALIDA', async () => {
    await expect(
      caso.ejecutar(
        OBRA,
        {},
        criterios({ tamano: 101 }),
        residente('residente-1'),
      ),
    ).rejects.toMatchObject({ codigo: 'PAGINACION_INVALIDA', status: 400 });
  });

  it('quien no ve la obra → 404 OBRA_NO_ENCONTRADA', async () => {
    await expect(
      caso.ejecutar(OBRA, {}, criterios(), residente('residente-2')),
    ).rejects.toMatchObject({ codigo: 'OBRA_NO_ENCONTRADA', status: 404 });
  });
});
