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
/** Otra obra con salidas en el mismo periodo (lote, 505), de otro residente. */
const OBRA_2 = 'obra-2';
/** Obra sin salidas en el periodo (solo un ingreso): no aparece en el lote. */
const OBRA_3 = 'obra-3';
const agente: UsuarioAutenticado = {
  id: 'sa-ia-agentes',
  roles: ['agente_ia'],
  azp: 'ia-agentes',
};
/** Residente asignado solo a `OBRA_2`. */
const residente2: UsuarioAutenticado = {
  id: 'r2',
  roles: ['residente'],
  azp: 'erp',
};

let secuencia = 0;
const movimiento = (
  tipo: TipoMovimiento,
  materialId: string,
  cantidad: number,
  partidaId: string | null,
  superaStock = false,
  periodo = '2026-11',
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
  superaStock,
  registradoPor: 'almacenero-1',
  registradoEn: new Date('2026-11-15T10:00:00Z'),
  notaRemision: null,
});

const obraAcceso = (obraId: string, nombre: string, residenteId: string) =>
  new ObraAcceso(
    obraId,
    nombre,
    { residenteId, maestroId: 'm', almaceneroId: 'a', clienteId: 'c' },
    new Date(),
  );

const material = (id: string, codigo: string, unidad: string) =>
  new Material(id, {
    codigo,
    nombre: 'Material ' + codigo,
    tipo: 'OTRO',
    unidad,
    unidadPlural: unidad,
    precioReferencial: 62,
    activo: true,
    atributos: [],
  });

describe('ConsultarConsumosPartidaCasoUso (consumos_partida, 501 y 505)', () => {
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
    await obras.guardar(obraAcceso(OBRA, 'Edificio Las Palmas', 'r'));
    await obras.guardar(obraAcceso(OBRA_2, 'Casa Equipetrol', 'r2'));
    await obras.guardar(obraAcceso(OBRA_3, 'Galpón Norte', 'r'));
    await materiales.crear(material('cem', 'CEM-IP30', 'bolsa'));
    await materiales.crear(material('are', 'ARE-FINA', 'm3'));
    for (const m of [
      movimiento('INGRESO', 'cem', 100, null),
      movimiento('SALIDA', 'cem', 10.5, 'p-1'),
      movimiento('SALIDA', 'cem', 4, 'p-1', true),
      movimiento('SALIDA', 'cem', 7, 'p-2'),
      movimiento('SALIDA', 'cem', 99, 'p-1', false, '2026-10'),
      movimiento('SALIDA', 'are', 2, 'q-1', true, '2026-11', OBRA_2),
      movimiento('INGRESO', 'cem', 50, null, false, '2026-11', OBRA_3),
    ]) {
      await movimientos.crear(m);
    }
  });

  const resumir = (filas: Awaited<ReturnType<typeof caso.ejecutar>>['filas']) =>
    filas.map(({ resumen, material: m, obraNombre }) => [
      resumen.obraId,
      obraNombre,
      resumen.partidaId,
      m.codigo,
      resumen.cantidad,
      resumen.salidas,
      resumen.salidasSuperanStock,
    ]);

  it('suma las salidas del periodo por partida, con número de salidas, las que superaron el stock y el nombre de la obra', async () => {
    const resultado = await caso.ejecutar(
      { obraId: OBRA, periodo: '2026-11', limite: 200 },
      agente,
    );
    expect(resumir(resultado.filas)).toEqual([
      [OBRA, 'Edificio Las Palmas', 'p-1', 'CEM-IP30', 14.5, 2, 1],
      [OBRA, 'Edificio Las Palmas', 'p-2', 'CEM-IP30', 7, 1, 0],
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

  describe('sin obraId (lote, 505)', () => {
    it('todas las obras con salidas en el periodo, por obra, partida y material; cerrado null', async () => {
      cierres.cerrar(OBRA, '2026-11');
      const resultado = await caso.ejecutar(
        { periodo: '2026-11', limite: 500 },
        agente,
      );
      expect(resumir(resultado.filas)).toEqual([
        [OBRA, 'Edificio Las Palmas', 'p-1', 'CEM-IP30', 14.5, 2, 1],
        [OBRA, 'Edificio Las Palmas', 'p-2', 'CEM-IP30', 7, 1, 0],
        [OBRA_2, 'Casa Equipetrol', 'q-1', 'ARE-FINA', 2, 1, 1],
      ]);
      // El cierre es por obra: en el lote no se informa.
      expect(resultado.cerrado).toBeNull();
      expect(resultado.truncado).toBe(false);
    });

    it('filtra por partida y recorta a limite con truncado', async () => {
      const deLaPartida = await caso.ejecutar(
        { periodo: '2026-11', partidaId: 'q-1', limite: 500 },
        agente,
      );
      expect(deLaPartida.filas.map((f) => f.resumen.obraId)).toEqual([OBRA_2]);
      const recortado = await caso.ejecutar(
        { periodo: '2026-11', limite: 2 },
        agente,
      );
      expect(recortado.filas.map((f) => f.resumen.partidaId)).toEqual([
        'p-1',
        'p-2',
      ]);
      expect(recortado.truncado).toBe(true);
    });

    it('periodo sin salidas: sin filas', async () => {
      expect(
        await caso.ejecutar({ periodo: '2020-01', limite: 500 }, agente),
      ).toEqual({ cerrado: null, filas: [], truncado: false });
    });

    it('solo las obras que el usuario ve: un residente no recibe las de otros', async () => {
      const resultado = await caso.ejecutar(
        { periodo: '2026-11', limite: 500 },
        residente2,
      );
      expect(resultado.filas.map((f) => f.resumen.obraId)).toEqual([OBRA_2]);
      await expect(
        caso.ejecutar(
          { obraId: OBRA, periodo: '2026-11', limite: 200 },
          residente2,
        ),
      ).rejects.toMatchObject({ codigo: 'OBRA_NO_ENCONTRADA' });
    });

    it('sin obras visibles no consulta los movimientos', async () => {
      const espia = vi.spyOn(movimientos, 'resumirSalidas');
      const resultado = await caso.ejecutar(
        { periodo: '2026-11', limite: 500 },
        { id: 'x', roles: ['residente'], azp: 'erp' },
      );
      expect(resultado).toEqual({ cerrado: null, filas: [], truncado: false });
      expect(espia).not.toHaveBeenCalled();
    });
  });
});
