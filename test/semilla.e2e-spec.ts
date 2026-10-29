import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { AccesoObraModule } from '../src/acceso-obra/acceso-obra.module.js';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import { CierresModule } from '../src/cierres/cierres.module.js';
import { MovimientosModule } from '../src/movimientos/movimientos.module.js';
import { CargarSemilla } from '../src/semilla/cargar-semilla.js';
import { leerDatosSemilla } from '../src/semilla/datos-semilla.js';
import { GuardaSemillaError } from '../src/semilla/guarda.js';
import json from '../src/semilla/materiales.json' with { type: 'json' };
import { SemillaInvalidaError } from '../src/semilla/preparar-semilla.js';
import { SemillaModule } from '../src/semilla/semilla.module.js';
import { COLECCIONES_NEGOCIO, VaciarSemilla } from '../src/semilla/vaciar.js';
import { StockModule } from '../src/stock/stock.module.js';
import { crearAppPrueba, type AppPrueba } from './utilidades/app-prueba.js';
import { RabbitPrueba } from './utilidades/canal-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const D = '2026-10-28';
const obra = (o: number) => `b0000000-0000-4000-8000-00000000000${o}`;
const material = (nn: string) => `e0000000-0000-4000-8000-0000000000${nn}`;
const CEM_IP30 = material('01');
const FIE_12 = material('02');
const GRA_34 = material('08');
const RESIDENTE_1 = 'a0000000-0000-4000-8000-000000000003';

/** Estado final de la sección 9 de `docs/datos-prueba.md` (código → [cantidad, estado]). */
const STOCK_ESPERADO: Record<string, Record<string, [number, string]>> = {
  [obra(1)]: {
    'CEM-IP30': [238, 'OK'],
    'FIE-12': [1150, 'JUSTO'],
    'FIE-10': [900, 'OK'],
    'ARE-GRU': [25, 'OK'],
    'GRA-34': [25, 'OK'],
    'LAD-6H': [2900, 'OK'],
    'ARE-FIN': [8, 'OK'],
  },
  [obra(2)]: {
    'CEM-IP30': [25, 'BAJO'],
    'ARE-GRU': [24, 'OK'],
    'GRA-34': [9, 'JUSTO'],
    'PIE-MAN': [5, 'OK'],
    'FIE-12': [950, 'OK'],
  },
  [obra(3)]: {
    'CEM-IP30': [300, 'OK'],
    'FIE-12': [2000, 'OK'],
  },
};

describe('Semilla de datos de prueba (e2e, 011)', () => {
  let prueba: AppPrueba;
  let semilla: INestApplicationContext;
  const tokens: Record<string, string> = {};

  const contextoSemilla = (config: Record<string, string>) =>
    NestFactory.createApplicationContext(SemillaModule.registrar(config), {
      logger: false,
      abortOnError: false,
    });
  const cargar = (d = D) => semilla.get(CargarSemilla).ejecutar(d);
  const contar = async () => {
    const conteos: Record<string, number> = {};
    for (const coleccion of COLECCIONES_NEGOCIO) {
      conteos[coleccion] = await prueba.conexion
        .collection(coleccion)
        .countDocuments();
    }
    return conteos;
  };

  beforeAll(async () => {
    prueba = await crearAppPrueba(
      [
        AccesoObraModule,
        CatalogoModule,
        StockModule,
        CierresModule,
        MovimientosModule,
      ],
      new RabbitPrueba(),
    );
    semilla = await contextoSemilla({
      MONGODB_URI: prueba.uri,
      NODE_ENV: 'development',
    });
    tokens.admin = await prueba.claves.firmarConRoles(['admin']);
    tokens.gerente = await prueba.claves.firmarConRoles(['gerente']);
    tokens.residente1 = await prueba.claves.firmarConRoles(
      ['residente'],
      AZP.erp,
      { payload: { sub: RESIDENTE_1 } },
    );
  }, 300_000);

  afterAll(async () => {
    await semilla?.close();
    await prueba?.cerrar();
  });

  beforeEach(async () => {
    await semilla.get(VaciarSemilla).ejecutar();
  });

  const servidor = () => prueba.app.getHttpServer();
  const get = (ruta: string, token = tokens.admin) =>
    request(servidor()).get(ruta).set('Authorization', `Bearer ${token}`);

  it('cargar dos veces con D fija deja los mismos conteos, sin duplicar', async () => {
    const primera = await cargar();
    const esperado = {
      material: 15,
      obra_acceso: 3,
      stock_obra: 14,
      movimiento: 67,
      cierre_periodo: 3,
    };
    expect(primera).toEqual({
      fecha: D,
      insertados: esperado,
      totales: { ...esperado, outbox_evento: 0 },
    });
    const segunda = await cargar();
    expect(segunda.insertados).toEqual({
      material: 0,
      obra_acceso: 0,
      stock_obra: 0,
      movimiento: 0,
      cierre_periodo: 0,
    });
    expect(segunda.totales).toEqual(primera.totales);
    expect(await contar()).toEqual({
      ...esperado,
      outbox_evento: 0,
      mensaje_procesado: 0,
    });
  });

  it('no escribe en outbox_evento ni en mensaje_procesado', async () => {
    await cargar();
    expect(
      await prueba.conexion.collection('outbox_evento').countDocuments(),
    ).toBe(0);
    expect(
      await prueba.conexion.collection('mensaje_procesado').countDocuments(),
    ).toBe(0);
  });

  it('stock y estado de las 14 filas (1 BAJO, 2 JUSTO, 11 OK) por GET /obras/{id}/stock', async () => {
    await cargar();
    const estados: string[] = [];
    for (const [obraId, esperado] of Object.entries(STOCK_ESPERADO)) {
      const respuesta = await get(`/obras/${obraId}/stock`).expect(200);
      const filas = respuesta.body as {
        codigo: string;
        cantidad: number;
        estado: string;
      }[];
      expect(
        Object.fromEntries(
          filas.map((f) => [f.codigo, [f.cantidad, f.estado]]),
        ),
      ).toEqual(esperado);
      estados.push(...filas.map((f) => f.estado));
    }
    expect(estados).toHaveLength(14);
    expect(estados.filter((e) => e === 'BAJO')).toHaveLength(1);
    expect(estados.filter((e) => e === 'JUSTO')).toHaveLength(2);
    // La fila guardada: version 1 y la cantidad como Decimal128.
    const fila = await prueba.conexion
      .collection('stock_obra')
      .findOne({ _id: `${obra(2)}:${CEM_IP30}` as never });
    expect(fila).toMatchObject({ version: 1, obra_id: obra(2) });
    expect(fila?.cantidad.toString()).toBe('25');
    expect(fila?.minimo.toString()).toBe('150');
  });

  it('solo la salida 20018 tiene supera_stock', async () => {
    await cargar();
    const marcados = await prueba.conexion
      .collection('movimiento')
      .find({ supera_stock: true })
      .toArray();
    expect(marcados.map((m) => m._id)).toEqual([
      'f0000000-0000-4000-8000-000000020018',
    ]);
    expect(marcados[0]).toMatchObject({
      tipo: 'SALIDA',
      material_id: CEM_IP30,
      periodo: '2026-09',
      cerrado: false,
    });
  });

  it('movimientos de periodos cerrados con cerrado = true; los demás en false', async () => {
    await cargar();
    const movimientos = await prueba.conexion
      .collection('movimiento')
      .find({})
      .toArray();
    const cerrados = new Set(['1:2026-07', '1:2026-08', '2:2026-08']);
    for (const m of movimientos) {
      const clave = `${String(m.obra_id).at(-1)}:${m.periodo}`;
      expect(m.cerrado).toBe(cerrados.has(clave));
    }
    // obra 1: 8 en 2026-07 y 17 en 2026-08; obra 2: 13 en 2026-08
    expect(movimientos.filter((m) => m.cerrado)).toHaveLength(38);
    const cierres = await prueba.conexion
      .collection('cierre_periodo')
      .find({})
      .sort({ _id: 1 })
      .toArray();
    expect(cierres.map((c) => [c._id, c.planilla_id, c.estado])).toEqual([
      [`${obra(1)}:2026-07`, 'd0000000-0000-4000-8000-000000000101', 'CERRADO'],
      [`${obra(1)}:2026-08`, 'd0000000-0000-4000-8000-000000000102', 'CERRADO'],
      [`${obra(2)}:2026-08`, 'd0000000-0000-4000-8000-000000000201', 'CERRADO'],
    ]);
  });

  it('GET /obras/{obra 1}/consumos?periodo=2026-09 → 6.000 kg de FIE-12 en P-03', async () => {
    await cargar();
    const respuesta = await get(
      `/obras/${obra(1)}/consumos?periodo=2026-09`,
      tokens.gerente,
    ).expect(200);
    expect(respuesta.body).toContainEqual({
      partidaId: 'b1000000-0000-4000-8000-000000000103',
      materialId: FIE_12,
      cantidad: 6000,
    });
  });

  it('GET /stock/resumen → 1 material bajo en la obra 2', async () => {
    await cargar();
    const respuesta = await get(
      `/stock/resumen?obraIds=${obra(1)},${obra(2)},${obra(3)}`,
      tokens.gerente,
    ).expect(200);
    expect(respuesta.body).toEqual([
      { obraId: obra(1), materialesBajos: 0 },
      { obraId: obra(2), materialesBajos: 1 },
      { obraId: obra(3), materialesBajos: 0 },
    ]);
  });

  it('catálogo: 15 materiales, uno inactivo y uno sin proveedor habitual', async () => {
    await cargar();
    const todos = await get('/materiales?tamano=100').expect(200);
    expect(todos.body.total).toBe(15);
    const activos = await get('/materiales?soloActivos=true&tamano=100').expect(
      200,
    );
    expect(activos.body.total).toBe(14);
    const sinProveedor = await prueba.conexion
      .collection('material')
      .find({ proveedor_habitual_id: null })
      .toArray();
    expect(sinProveedor.map((m) => m.codigo)).toEqual(['TUB-PVC4']);
    const cemento = await prueba.conexion
      .collection('material')
      .findOne({ _id: CEM_IP30 as never });
    expect(cemento).toMatchObject({
      codigo: 'CEM-IP30',
      unidad_plural: 'bolsas',
      proveedor_habitual_id: '7b1e5c1a-0001-4c3e-9a10-000000000001',
      atributos: [{ nombre: 'peso', valor: '50 kg' }],
    });
  });

  it('obra_acceso con las asignaciones: residente1 ve la obra 1 y no la 2', async () => {
    await cargar();
    await get(`/obras/${obra(1)}/stock`, tokens.residente1).expect(200);
    const ajena = await get(
      `/obras/${obra(2)}/stock`,
      tokens.residente1,
    ).expect(404);
    expect(ajena.body.codigo).toBe('OBRA_NO_ENCONTRADA');
  });

  it('no pisa lo que ya existe: cargar otra vez no devuelve un cambio de la demostración', async () => {
    await cargar();
    await prueba.conexion
      .collection('stock_obra')
      .updateOne(
        { _id: `${obra(2)}:${GRA_34}` as never },
        { $set: { version: 7 } },
      );
    await cargar();
    const fila = await prueba.conexion
      .collection('stock_obra')
      .findOne({ _id: `${obra(2)}:${GRA_34}` as never });
    expect(fila?.version).toBe(7);
  });

  it('con otra D, las fechas se mueven: periodos relativos a esa D', async () => {
    await cargar('2027-01-20');
    const ingreso = await prueba.conexion
      .collection('movimiento')
      .findOne({ _id: 'f0000000-0000-4000-8000-000000010001' as never });
    expect(ingreso?.periodo).toBe('2026-10');
    expect(ingreso?.registrado_en).toEqual(new Date('2026-10-05T14:00:00Z'));
    const cierres = await prueba.conexion
      .collection('cierre_periodo')
      .find({})
      .sort({ _id: 1 })
      .toArray();
    expect(cierres.map((c) => c._id)).toEqual([
      `${obra(1)}:2026-10`,
      `${obra(1)}:2026-11`,
      `${obra(2)}:2026-11`,
    ]);
  });

  it('si los datos no cuadran con el documento, falla y no escribe nada', async () => {
    const datos = leerDatosSemilla(structuredClone(json));
    datos.stock[0].cantidadEsperada = 999;
    await expect(
      semilla.get(CargarSemilla).ejecutar(D, datos),
    ).rejects.toBeInstanceOf(SemillaInvalidaError);
    expect(Object.values(await contar()).every((n) => n === 0)).toBe(true);
  });

  it('vaciar deja vacías las colecciones del negocio y conserva colecciones e índices', async () => {
    await cargar();
    await prueba.conexion.collection('outbox_evento').insertOne({
      _id: 'evento-viejo' as never,
      tipo: 'StockBajo',
      payload: {},
      creado_en: new Date(),
      publicado_en: null,
    });
    const borrados = await semilla.get(VaciarSemilla).ejecutar();
    expect(borrados).toMatchObject({
      material: 15,
      movimiento: 67,
      outbox_evento: 1,
    });
    expect(Object.values(await contar()).every((n) => n === 0)).toBe(true);
    const indices = await prueba.conexion.collection('material').indexes();
    expect(indices.map((i) => i.name)).toContain('codigo_unico');
  });

  it('la guarda rechaza NODE_ENV=production y una base que no es local', async () => {
    await expect(
      contextoSemilla({ MONGODB_URI: prueba.uri, NODE_ENV: 'production' }),
    ).rejects.toBeInstanceOf(GuardaSemillaError);
    await expect(
      contextoSemilla({
        MONGODB_URI: 'mongodb://db.remoto.com:27017/materiales_db',
        NODE_ENV: 'development',
      }),
    ).rejects.toBeInstanceOf(GuardaSemillaError);
  });
});
