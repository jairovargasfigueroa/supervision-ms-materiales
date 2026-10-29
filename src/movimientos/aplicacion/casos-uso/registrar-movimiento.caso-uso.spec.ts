import { MaterialRepositorioMemoria } from '../../../../test/utilidades/material-memoria.js';
import {
  CierrePeriodoRepositorioMemoria,
  MovimientoRepositorioMemoria,
} from '../../../../test/utilidades/movimiento-memoria.js';
import { ObraAccesoRepositorioMemoria } from '../../../../test/utilidades/obra-acceso-memoria.js';
import { StockRepositorioMemoria } from '../../../../test/utilidades/stock-memoria.js';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import { ObraAcceso } from '../../../acceso-obra/dominio/obra-acceso.js';
import {
  type DatosMaterial,
  Material,
} from '../../../catalogo/dominio/material.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import type { Outbox } from '../../../compartido/infraestructura/mensajeria/outbox.js';
import type { Transaccion } from '../../../compartido/infraestructura/mongo/transaccion.js';
import { StockCambiadoError } from '../../../stock/aplicacion/puertos/stock.repositorio.js';
import { MovimientoRepetidoError } from '../puertos/movimiento.repositorio.js';
import {
  INTENTOS_STOCK,
  type RegistrarMovimientoEntrada,
  RegistrarMovimientoCasoUso,
} from './registrar-movimiento.caso-uso.js';

const OBRA = 'obra-1';
const almacenero: UsuarioAutenticado = {
  id: 'almacenero-1',
  roles: ['almacenero'],
  azp: 'app-obra',
};

const datos = (cambios: Partial<DatosMaterial> = {}): DatosMaterial => ({
  codigo: 'CEM-IP30',
  nombre: 'Cemento IP-30',
  tipo: 'CEMENTO',
  unidad: 'bolsa',
  unidadPlural: 'bolsas',
  precioReferencial: 62,
  activo: true,
  atributos: [],
  ...cambios,
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

describe('RegistrarMovimientoCasoUso', () => {
  let movimientos: MovimientoRepositorioMemoria;
  let stock: StockRepositorioMemoria;
  let cierres: CierrePeriodoRepositorioMemoria;
  let caso: RegistrarMovimientoCasoUso;
  let outbox: OutboxMemoria;

  const entrada = (
    cambios: Partial<RegistrarMovimientoEntrada> = {},
  ): RegistrarMovimientoEntrada => ({
    id: crypto.randomUUID(),
    obraId: OBRA,
    materialId: 'cemento',
    tipo: 'INGRESO',
    cantidad: 10,
    partidaId: null,
    numeroNotaRemision: null,
    registradoEn: new Date('2026-11-15T14:00:00Z'),
    ...cambios,
  });

  beforeEach(async () => {
    const obras = new ObraAccesoRepositorioMemoria();
    const materiales = new MaterialRepositorioMemoria();
    movimientos = new MovimientoRepositorioMemoria();
    stock = new StockRepositorioMemoria();
    cierres = new CierrePeriodoRepositorioMemoria();
    outbox = new OutboxMemoria();
    caso = new RegistrarMovimientoCasoUso(
      new AccesoObraServicio(obras),
      movimientos,
      stock,
      materiales,
      cierres,
      transaccionDirecta,
      outbox as unknown as Outbox,
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
    await materiales.crear(new Material('cemento', datos()));
    await materiales.crear(
      new Material('viejo', datos({ codigo: 'VIEJO', activo: false })),
    );
  });

  it('un ingreso suma al stock (crea la fila con mínimo 0) y guarda el movimiento', async () => {
    const resultado = await caso.ejecutar(
      entrada({ numeroNotaRemision: 'NR-1' }),
      almacenero,
    );
    expect(resultado.creado).toBe(true);
    expect(resultado.stock).toMatchObject({ cantidad: 10, minimo: 0 });
    expect(resultado.movimiento).toMatchObject({
      periodo: '2026-11',
      superaStock: false,
      cerrado: false,
      registradoPor: 'almacenero-1',
      partidaId: null,
      notaRemision: { numero: 'NR-1', claveFoto: null },
    });
    expect(movimientos.movimientos.size).toBe(1);
  });

  it('una salida resta y marca superaStock si es mayor que el stock previo', async () => {
    stock.poner(OBRA, 'cemento', 10, 5);
    const igual = await caso.ejecutar(
      entrada({ tipo: 'SALIDA', cantidad: 10, partidaId: 'partida-1' }),
      almacenero,
    );
    expect(igual.movimiento.superaStock).toBe(false);
    expect(igual.stock.cantidad).toBe(0);

    const mayor = await caso.ejecutar(
      entrada({ tipo: 'SALIDA', cantidad: 0.001, partidaId: 'partida-1' }),
      almacenero,
    );
    expect(mayor.movimiento.superaStock).toBe(true);
    expect(mayor.stock.cantidad).toBe(-0.001);
    expect(mayor.stock.estado).toBe('BAJO');
  });

  it('suma sin errores de coma flotante (0,1 + 0,2 = 0,3)', async () => {
    await caso.ejecutar(entrada({ cantidad: 0.1 }), almacenero);
    const r = await caso.ejecutar(entrada({ cantidad: 0.2 }), almacenero);
    expect(r.stock.cantidad).toBe(0.3);
  });

  it('el mismo id dos veces devuelve el existente sin volver a sumar', async () => {
    const primera = entrada();
    await caso.ejecutar(primera, almacenero);
    const repetida = await caso.ejecutar(
      { ...primera, cantidad: 99 },
      almacenero,
    );
    expect(repetida.creado).toBe(false);
    expect(repetida.movimiento.cantidad).toBe(10);
    expect(repetida.stock.cantidad).toBe(10);
  });

  it('si otro envío del mismo id gana a la vez, devuelve el existente', async () => {
    const primera = entrada();
    await caso.ejecutar(primera, almacenero);
    // Simula que la búsqueda inicial no lo vio (llegó a la vez).
    const buscar = vi.spyOn(movimientos, 'buscar').mockResolvedValueOnce(null);
    const r = await caso.ejecutar(primera, almacenero);
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(r.creado).toBe(false);
  });

  it('el periodo es el mes en America/La_Paz y uno cerrado → 409 PERIODO_CERRADO', async () => {
    cierres.cerrar(OBRA, '2026-11');
    await expect(
      caso.ejecutar(
        entrada({ registradoEn: new Date('2026-12-01T03:00:00Z') }),
        almacenero,
      ),
    ).rejects.toMatchObject({
      codigo: 'PERIODO_CERRADO',
      status: 409,
      message: 'El periodo 2026-11 ya está cerrado',
    });
    const r = await caso.ejecutar(
      entrada({ registradoEn: new Date('2026-12-01T04:00:00Z') }),
      almacenero,
    );
    expect(r.movimiento.periodo).toBe('2026-12');
  });

  it('acceso y material: 403, 404 y 422', async () => {
    await expect(
      caso.ejecutar(entrada(), { ...almacenero, roles: ['maestro'] }),
    ).rejects.toMatchObject({ codigo: 'SIN_PERMISO', status: 403 });
    await expect(
      caso.ejecutar(entrada(), { ...almacenero, id: 'almacenero-2' }),
    ).rejects.toMatchObject({ codigo: 'OBRA_NO_ENCONTRADA', status: 404 });
    await expect(
      caso.ejecutar(entrada({ materialId: 'no-existe' }), almacenero),
    ).rejects.toMatchObject({ codigo: 'MATERIAL_NO_ENCONTRADO', status: 404 });
    await expect(
      caso.ejecutar(entrada({ materialId: 'viejo' }), almacenero),
    ).rejects.toMatchObject({ codigo: 'MATERIAL_INACTIVO', status: 422 });
    expect(movimientos.movimientos.size).toBe(0);
    expect(stock.filas.size).toBe(0);
  });

  it('un repetido de otra obra no se revela a quien no está asignado', async () => {
    const primera = entrada();
    await caso.ejecutar(primera, almacenero);
    await expect(
      caso.ejecutar(primera, { ...almacenero, id: 'almacenero-2' }),
    ).rejects.toMatchObject({ codigo: 'OBRA_NO_ENCONTRADA' });
  });

  it('si el stock cambió a la vez, vuelve a intentar; tras varios choques, falla', async () => {
    const ajustar = vi
      .spyOn(stock, 'ajustar')
      .mockRejectedValueOnce(new StockCambiadoError(OBRA, 'cemento'));
    const r = await caso.ejecutar(entrada(), almacenero);
    expect(r.creado).toBe(true);
    expect(ajustar).toHaveBeenCalledTimes(2);

    ajustar.mockReset();
    ajustar.mockRejectedValue(new StockCambiadoError(OBRA, 'cemento'));
    await expect(caso.ejecutar(entrada(), almacenero)).rejects.toBeInstanceOf(
      StockCambiadoError,
    );
    expect(ajustar).toHaveBeenCalledTimes(INTENTOS_STOCK);
  });

  it('MovimientoRepetidoError sin movimiento guardado se propaga', async () => {
    vi.spyOn(movimientos, 'crear').mockRejectedValueOnce(
      new MovimientoRepetidoError('x'),
    );
    await expect(caso.ejecutar(entrada(), almacenero)).rejects.toBeInstanceOf(
      MovimientoRepetidoError,
    );
  });

  describe('Eventos (outbox)', () => {
    it('siempre guarda MovimientoRegistrado con sus datos y el correlacionId', async () => {
      const flujo = crypto.randomUUID();
      const e = entrada({
        tipo: 'SALIDA',
        partidaId: 'partida-1',
        cantidad: 2.5,
      });
      stock.poner(OBRA, 'cemento', 100, 10);
      await caso.ejecutar(e, almacenero, flujo);
      expect(outbox.agregados).toEqual([
        {
          tipo: 'MovimientoRegistrado',
          datos: {
            movimientoId: e.id,
            obraId: OBRA,
            materialId: 'cemento',
            tipo: 'SALIDA',
            cantidad: 2.5,
            partidaId: 'partida-1',
            periodo: '2026-11',
            superaStock: false,
            registradoEn: '2026-11-15T14:00:00.000Z',
          },
          correlacionId: flujo,
        },
      ]);
    });

    it('StockBajo solo al cruzar el mínimo; si ya estaba BAJO no se repite', async () => {
      stock.poner(OBRA, 'cemento', 12, 10); // JUSTO
      const salir = (cantidad: number) =>
        caso.ejecutar(
          entrada({ tipo: 'SALIDA', partidaId: 'partida-1', cantidad }),
          almacenero,
        );
      await salir(2); // 10: JUSTO, sin aviso
      await salir(1); // 9: BAJO, aviso
      await salir(1); // 8: sigue BAJO, sin aviso
      await caso.ejecutar(entrada({ cantidad: 5 }), almacenero); // 13: OK
      await salir(4); // 9: BAJO otra vez, aviso
      expect(
        outbox.agregados
          .filter((a) => a.tipo === 'StockBajo')
          .map((a) => a.datos),
      ).toEqual([
        { obraId: OBRA, materialId: 'cemento', cantidad: 9, minimo: 10 },
        { obraId: OBRA, materialId: 'cemento', cantidad: 9, minimo: 10 },
      ]);
      expect(
        outbox.agregados.filter((a) => a.tipo === 'MovimientoRegistrado'),
      ).toHaveLength(5);
    });

    it('un envío repetido o un error no guardan eventos', async () => {
      const e = entrada();
      await caso.ejecutar(e, almacenero);
      outbox.agregados.length = 0;
      await caso.ejecutar(e, almacenero);
      cierres.cerrar(OBRA, '2026-11');
      await expect(caso.ejecutar(entrada(), almacenero)).rejects.toMatchObject({
        codigo: 'PERIODO_CERRADO',
      });
      expect(outbox.agregados).toEqual([]);
    });
  });
});
