import { Types } from 'mongoose';
import request from 'supertest';
import { AccesoObraModule } from '../src/acceso-obra/acceso-obra.module.js';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import { CierresModule } from '../src/cierres/cierres.module.js';
import { MovimientosModule } from '../src/movimientos/movimientos.module.js';
import { StockModule } from '../src/stock/stock.module.js';
import { crearAppPrueba, type AppPrueba } from './utilidades/app-prueba.js';
import { RabbitPrueba } from './utilidades/canal-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const OBRA_ID = 'b2c3d4e5-0000-4000-8000-000000000001';
const OTRA_OBRA_ID = 'b2c3d4e5-0000-4000-8000-000000000002';
const PARTIDA_A = 'c3d4e5f6-0000-4000-8000-000000000001';
const PARTIDA_B = 'c3d4e5f6-0000-4000-8000-000000000002';

describe('Consumos por partida y material (e2e)', () => {
  let prueba: AppPrueba;
  const tokens: Record<string, string> = {};

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
    tokens.admin = await prueba.claves.firmarConRoles(['admin']);
    tokens.gerente = await prueba.claves.firmarConRoles(['gerente']);
    for (const [nombre, rol, sub, azp] of [
      ['residente', 'residente', 'residente-1', AZP.erp],
      ['residente2', 'residente', 'residente-2', AZP.erp],
      ['maestro', 'maestro', 'maestro-1', AZP.appObra],
      ['almacenero', 'almacenero', 'almacenero-1', AZP.appObra],
      ['cliente', 'cliente', 'cliente-1', AZP.portal],
    ] as const) {
      tokens[nombre] = await prueba.claves.firmarConRoles([rol], azp, {
        payload: { sub },
      });
    }
  }, 300_000);

  afterAll(async () => {
    await prueba?.cerrar();
  });

  beforeEach(async () => {
    await prueba.vaciar();
    await prueba.conexion.collection('obra_acceso').insertMany(
      [OBRA_ID, OTRA_OBRA_ID].map((id) => ({
        _id: id as never,
        nombre: 'Obra ' + id,
        residente_id: 'residente-1',
        maestro_id: 'maestro-1',
        almacenero_id: 'almacenero-1',
        cliente_id: 'cliente-1',
        actualizado_en: new Date(),
      })),
    );
  });

  const servidor = () => prueba.app.getHttpServer();
  const consultar = (
    consulta = '?periodo=2026-11',
    token = tokens.residente,
    obraId = OBRA_ID,
  ) =>
    request(servidor())
      .get('/obras/' + obraId + '/consumos' + consulta)
      .set('Authorization', 'Bearer ' + token);

  /** Los movimientos los registra la 004; aquí se insertan directo en la colección. */
  const insertar = (
    tipo: 'INGRESO' | 'SALIDA',
    materialId: string,
    cantidad: string,
    periodo: string,
    partidaId: string | null,
    obraId = OBRA_ID,
  ) =>
    prueba.conexion.collection('movimiento').insertOne({
      _id: crypto.randomUUID() as never,
      obra_id: obraId,
      material_id: materialId,
      tipo,
      cantidad: Types.Decimal128.fromString(cantidad),
      partida_id: partidaId,
      orden_compra_id: null,
      periodo,
      cerrado: false,
      supera_stock: false,
      registrado_por: 'almacenero-1',
      registrado_en: new Date(),
      nota_remision: null,
    });

  it('suma solo las salidas del periodo por partida y material', async () => {
    await insertar('SALIDA', 'cemento', '10.5', '2026-11', PARTIDA_A);
    await insertar('SALIDA', 'cemento', '0.1', '2026-11', PARTIDA_A);
    await insertar('SALIDA', 'cemento', '0.2', '2026-11', PARTIDA_A);
    await insertar('SALIDA', 'acero', '3', '2026-11', PARTIDA_A);
    await insertar('SALIDA', 'cemento', '4', '2026-11', PARTIDA_B);
    // No cuentan: ingresos, otro periodo y otra obra.
    await insertar('INGRESO', 'cemento', '100', '2026-11', null);
    await insertar('SALIDA', 'cemento', '7', '2026-10', PARTIDA_A);
    await insertar(
      'SALIDA',
      'cemento',
      '9',
      '2026-11',
      PARTIDA_A,
      OTRA_OBRA_ID,
    );

    const respuesta = await consultar().expect(200);
    expect(respuesta.body).toEqual([
      { partidaId: PARTIDA_A, materialId: 'acero', cantidad: 3 },
      { partidaId: PARTIDA_A, materialId: 'cemento', cantidad: 10.8 },
      { partidaId: PARTIDA_B, materialId: 'cemento', cantidad: 4 },
    ]);

    const octubre = await consultar('?periodo=2026-10').expect(200);
    expect(octubre.body).toEqual([
      { partidaId: PARTIDA_A, materialId: 'cemento', cantidad: 7 },
    ]);
  });

  it('sin salidas en el periodo (solo ingresos) → lista vacía', async () => {
    await insertar('INGRESO', 'cemento', '100', '2026-11', null);
    expect((await consultar().expect(200)).body).toEqual([]);
  });

  it('periodo ausente o mal formado → 400 DATOS_INVALIDOS', async () => {
    for (const consulta of ['', '?periodo=2026-13', '?periodo=nov']) {
      const respuesta = await consultar(consulta).expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
    }
  });

  it.each(['admin', 'gerente', 'residente'])(
    '%s (asignado o que ve todas) puede consultar',
    async (rol) => {
      await consultar('?periodo=2026-11', tokens[rol]).expect(200);
    },
  );

  it.each(['maestro', 'almacenero', 'cliente'])(
    '%s (aunque esté asignado) → 403 SIN_PERMISO',
    async (rol) => {
      const respuesta = await consultar('?periodo=2026-11', tokens[rol]).expect(
        403,
      );
      expect(respuesta.body.codigo).toBe('SIN_PERMISO');
    },
  );

  it('residente no asignado u obra que no está en obra_acceso → 404 OBRA_NO_ENCONTRADA', async () => {
    expect(
      (await consultar('?periodo=2026-11', tokens.residente2).expect(404)).body
        .codigo,
    ).toBe('OBRA_NO_ENCONTRADA');
    const inexistente = 'b2c3d4e5-0000-4000-8000-000000000099';
    expect(
      (
        await consultar('?periodo=2026-11', tokens.admin, inexistente).expect(
          404,
        )
      ).body.codigo,
    ).toBe('OBRA_NO_ENCONTRADA');
  });

  it('sin token → 401 NO_AUTENTICADO', async () => {
    await request(servidor())
      .get('/obras/' + OBRA_ID + '/consumos?periodo=2026-11')
      .expect(401);
  });
});
