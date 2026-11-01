import { MaterialRepositorioMemoria } from '../../../../test/utilidades/material-memoria.js';
import {
  CierrePeriodoRepositorioMemoria,
  MovimientoRepositorioMemoria,
} from '../../../../test/utilidades/movimiento-memoria.js';
import { ObraAccesoRepositorioMemoria } from '../../../../test/utilidades/obra-acceso-memoria.js';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import { ObraAcceso } from '../../../acceso-obra/dominio/obra-acceso.js';
import { Material } from '../../../catalogo/dominio/material.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import type { Movimiento, TipoMovimiento } from '../../dominio/movimiento.js';
import { ConsultarConsumosPartidaCasoUso } from './consultar-consumos-partida.caso-uso.js';

const OBRA = 'obra-1';
const agente: UsuarioAutenticado = {
  id: 'sa-ia-agentes',
  roles: ['agente_ia'],
  azp: 'ia-agentes',
};

let secuencia = 0;
const movimiento = (
  tipo: TipoMovimiento,
  materialId: string,
  cantidad: number,
  partidaId: string | null,
  superaStock = false,
  periodo = '2026-11',
): Movimiento => ({
  id: `m-${++secuencia}`,
  obraId: OBRA,
  materialId,
  tipo,
  cantidad,
  partidaId,
  ordenCompraId: null,
  periodo,
  cerrado: false,
  superaStock,
  registradoPor: 'almacenero-1',
  registradoEn: new Date('2026-11-15T10:00:00Z'),
  notaRemision: null,
});

describe('ConsultarConsumosPartidaCasoUso (consumos_partida, 501)', () => {
  let movimientos: MovimientoRepositorioMemoria;
  let cierres: CierrePeriodoRepositorioMemoria;
  let caso: ConsultarConsumosPartidaCasoUso;

  beforeEach(async () => {
    const obras = new ObraAccesoRepositorioMemoria();
    const materiales = new MaterialRepositorioMemoria();
    movimientos = new MovimientoRepositorioMemoria();
    cierres = new CierrePeriodoRepositorioMemoria();
    caso = new ConsultarConsumosPartidaCasoUso(
      new AccesoObraServicio(obras),
      movimientos,
      cierres,
      materiales,
    );
    await obras.guardar(
      new ObraAcceso(
        OBRA,
        'Edificio Las Palmas',
        {
          residenteId: 'r',
          maestroId: 'm',
          almaceneroId: 'a',
          clienteId: 'c',
        },
        new Date(),
      ),
    );
    await materiales.crear(
      new Material('cem', {
        codigo: 'CEM-IP30',
        nombre: 'Cemento IP-30',
        tipo: 'CEMENTO',
        unidad: 'bolsa',
        unidadPlural: 'bolsas',
        precioReferencial: 62,
        activo: true,
        atributos: [],
      }),
    );
    for (const m of [
      movimiento('INGRESO', 'cem', 100, null),
      movimiento('SALIDA', 'cem', 10.5, 'p-1'),
      movimiento('SALIDA', 'cem', 4, 'p-1', true),
      movimiento('SALIDA', 'cem', 7, 'p-2'),
      movimiento('SALIDA', 'cem', 99, 'p-1', false, '2026-10'),
    ]) {
      await movimientos.crear(m);
    }
  });

  it('suma las salidas del periodo por partida, con número de salidas y las que superaron el stock', async () => {
    const resultado = await caso.ejecutar(
      { obraId: OBRA, periodo: '2026-11', limite: 200 },
      agente,
    );
    expect(
      resultado.filas.map(({ resumen, material }) => [
        resumen.partidaId,
        material.codigo,
        resumen.cantidad,
        resumen.salidas,
        resumen.salidasSuperanStock,
      ]),
    ).toEqual([
      ['p-1', 'CEM-IP30', 14.5, 2, 1],
      ['p-2', 'CEM-IP30', 7, 1, 0],
    ]);
    expect(resultado).toMatchObject({ cerrado: false, truncado: false });
  });

  it('filtra por partida, dice si el periodo está cerrado y recorta a limite', async () => {
    cierres.cerrar(OBRA, '2026-11');
    const resultado = await caso.ejecutar(
      { obraId: OBRA, periodo: '2026-11', partidaId: 'p-2', limite: 200 },
      agente,
    );
    expect(resultado.filas.map((f) => f.resumen.partidaId)).toEqual(['p-2']);
    expect(resultado.cerrado).toBe(true);
    const recortado = await caso.ejecutar(
      { obraId: OBRA, periodo: '2026-11', limite: 1 },
      agente,
    );
    expect(recortado.filas).toHaveLength(1);
    expect(recortado.truncado).toBe(true);
  });

  it('una obra que no está en obra_acceso es OBRA_NO_ENCONTRADA', async () => {
    await expect(
      caso.ejecutar(
        { obraId: 'otra', periodo: '2026-11', limite: 200 },
        agente,
      ),
    ).rejects.toMatchObject({ codigo: 'OBRA_NO_ENCONTRADA' });
  });
});
