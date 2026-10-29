import { MaterialRepositorioMemoria } from '../../../../test/utilidades/material-memoria.js';
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
import { FijarMinimoCasoUso } from './fijar-minimo.caso-uso.js';
import { ListarStockObraCasoUso } from './listar-stock-obra.caso-uso.js';
import { ResumirStockCasoUso } from './resumir-stock.caso-uso.js';

const OBRA = 'obra-1';
const admin: UsuarioAutenticado = {
  id: 'admin-1',
  roles: ['admin'],
  azp: 'erp',
};
const residente = (id: string): UsuarioAutenticado => ({
  id,
  roles: ['residente'],
  azp: 'erp',
});

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

/** Ejecuta el trabajo sin MongoDB (las escrituras van a los repositorios en memoria). */
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

describe('Casos de uso del stock', () => {
  let obras: ObraAccesoRepositorioMemoria;
  let materiales: MaterialRepositorioMemoria;
  let stock: StockRepositorioMemoria;
  let listar: ListarStockObraCasoUso;
  let fijar: FijarMinimoCasoUso;
  let resumir: ResumirStockCasoUso;
  let outbox: OutboxMemoria;

  beforeEach(async () => {
    obras = new ObraAccesoRepositorioMemoria();
    materiales = new MaterialRepositorioMemoria();
    stock = new StockRepositorioMemoria();
    outbox = new OutboxMemoria();
    const acceso = new AccesoObraServicio(obras);
    listar = new ListarStockObraCasoUso(acceso, stock, materiales);
    resumir = new ResumirStockCasoUso(acceso, stock);
    fijar = new FijarMinimoCasoUso(
      acceso,
      stock,
      materiales,
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
      new Material(
        'arena',
        datos({ codigo: 'ARE-FINA', nombre: 'Arena fina' }),
      ),
    );
    await materiales.crear(
      new Material('viejo', datos({ codigo: 'VIEJO', activo: false })),
    );
  });

  describe('ListarStockObraCasoUso', () => {
    it('lista las filas de la obra ordenadas por código, con su estado', async () => {
      stock.poner(OBRA, 'cemento', 120, 100);
      stock.poner(OBRA, 'arena', 5, 10);
      stock.poner('otra-obra', 'cemento', 1, 0);

      const filas = await listar.ejecutar(OBRA, residente('residente-1'));

      expect(
        filas.map((f) => [f.material.codigo, f.stock.cantidad, f.stock.estado]),
      ).toEqual([
        ['ARE-FINA', 5, 'BAJO'],
        ['CEM-IP30', 120, 'JUSTO'],
      ]);
    });

    it('un material desactivado sigue en el stock de la obra (historial)', async () => {
      stock.poner(OBRA, 'viejo', 3, 0);
      const filas = await listar.ejecutar(OBRA, admin);
      expect(filas.map((f) => f.material.codigo)).toEqual(['VIEJO']);
    });

    it('residente no asignado u obra que no está en obra_acceso → 404 OBRA_NO_ENCONTRADA', async () => {
      await expect(
        listar.ejecutar(OBRA, residente('residente-2')),
      ).rejects.toMatchObject({ codigo: 'OBRA_NO_ENCONTRADA', status: 404 });
      await expect(listar.ejecutar('no-existe', admin)).rejects.toMatchObject({
        codigo: 'OBRA_NO_ENCONTRADA',
      });
    });
  });

  describe('FijarMinimoCasoUso', () => {
    it('crea la fila con cantidad 0 si el material no estaba en la obra (upsert)', async () => {
      const fila = await fijar.ejecutar(OBRA, 'cemento', 50, admin);
      expect(fila.stock).toMatchObject({
        cantidad: 0,
        minimo: 50,
        version: 1,
        estado: 'BAJO',
      });
      expect(fila.material.codigo).toBe('CEM-IP30');
    });

    it('cambia el mínimo de una fila existente sin tocar la cantidad', async () => {
      stock.poner(OBRA, 'cemento', 120, 100);
      const fila = await fijar.ejecutar(OBRA, 'cemento', 90, admin);
      expect(fila.stock).toMatchObject({
        cantidad: 120,
        minimo: 90,
        version: 2,
        estado: 'OK',
      });
    });

    it('obra que no está en obra_acceso → 404 OBRA_NO_ENCONTRADA (también para admin)', async () => {
      await expect(
        fijar.ejecutar('no-existe', 'cemento', 1, admin),
      ).rejects.toMatchObject({ codigo: 'OBRA_NO_ENCONTRADA', status: 404 });
    });

    it('material que no existe → 404 MATERIAL_NO_ENCONTRADO', async () => {
      await expect(
        fijar.ejecutar(OBRA, 'no-existe', 1, admin),
      ).rejects.toMatchObject({
        codigo: 'MATERIAL_NO_ENCONTRADO',
        status: 404,
      });
    });

    it('material desactivado → 422 MATERIAL_INACTIVO y no crea la fila', async () => {
      await expect(
        fijar.ejecutar(OBRA, 'viejo', 1, admin),
      ).rejects.toMatchObject({ codigo: 'MATERIAL_INACTIVO', status: 422 });
      expect(stock.filas.size).toBe(0);
    });
  });
  describe('StockBajo al cruzar el mínimo', () => {
    it('mínimo nuevo sobre cantidad 0 (sin fila) → StockBajo con obraId, materialId, cantidad y minimo', async () => {
      await fijar.ejecutar(OBRA, 'cemento', 50, admin, 'flujo-1');
      expect(outbox.agregados).toEqual([
        {
          tipo: 'StockBajo',
          datos: {
            obraId: OBRA,
            materialId: 'cemento',
            cantidad: 0,
            minimo: 50,
          },
          correlacionId: 'flujo-1',
        },
      ]);
    });

    it('de JUSTO u OK a BAJO → StockBajo', async () => {
      stock.poner(OBRA, 'cemento', 120, 100);
      await fijar.ejecutar(OBRA, 'cemento', 121, admin);
      expect(outbox.agregados).toHaveLength(1);
      expect(outbox.agregados[0].datos).toMatchObject({
        cantidad: 120,
        minimo: 121,
      });
    });

    it('si ya estaba BAJO no se vuelve a avisar', async () => {
      stock.poner(OBRA, 'cemento', 10, 100);
      await fijar.ejecutar(OBRA, 'cemento', 200, admin);
      expect(outbox.agregados).toEqual([]);
    });

    it('si no queda BAJO (igual al mínimo es JUSTO) no avisa', async () => {
      stock.poner(OBRA, 'cemento', 100, 0);
      await fijar.ejecutar(OBRA, 'cemento', 100, admin);
      await fijar.ejecutar(OBRA, 'arena', 0, admin);
      expect(outbox.agregados).toEqual([]);
    });

    it('con un error (material inactivo) no se agrega nada', async () => {
      await expect(fijar.ejecutar(OBRA, 'viejo', 50, admin)).rejects.toThrow();
      expect(outbox.agregados).toEqual([]);
    });
  });

  describe('ResumirStockCasoUso (009)', () => {
    beforeEach(async () => {
      await obras.guardar(
        new ObraAcceso(
          'obra-2',
          'Torre Norte',
          {
            residenteId: 'residente-2',
            maestroId: 'maestro-2',
            almaceneroId: 'almacenero-2',
            clienteId: 'cliente-2',
          },
          new Date(),
        ),
      );
      stock.poner(OBRA, 'cemento', 5, 10); // BAJO
      stock.poner(OBRA, 'arena', 12, 10); // JUSTO
      stock.poner('obra-2', 'cemento', 0, 1); // BAJO
      stock.poner('obra-2', 'arena', 1, 2); // BAJO
    });

    it('admin ve todas las obras pedidas, sin repetir y en el orden pedido', async () => {
      expect(await resumir.ejecutar(['obra-2', OBRA, 'obra-2'], admin)).toEqual(
        [
          { obraId: 'obra-2', materialesBajos: 2 },
          { obraId: OBRA, materialesBajos: 1 },
        ],
      );
    });

    it('residente: solo sus obras; las que no ve o no están en obra_acceso se omiten', async () => {
      expect(
        await resumir.ejecutar(
          [OBRA, 'obra-2', 'no-existe'],
          residente('residente-1'),
        ),
      ).toEqual([{ obraId: OBRA, materialesBajos: 1 }]);
      expect(await resumir.ejecutar([OBRA], residente('residente-9'))).toEqual(
        [],
      );
    });

    it('una obra visible sin filas de stock cuenta 0', async () => {
      stock.filas.clear();
      expect(await resumir.ejecutar([OBRA], admin)).toEqual([
        { obraId: OBRA, materialesBajos: 0 },
      ]);
    });
  });
});
