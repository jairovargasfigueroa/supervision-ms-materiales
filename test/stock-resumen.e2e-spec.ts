import { Types } from 'mongoose';
import request from 'supertest';
import { AccesoObraModule } from '../src/acceso-obra/acceso-obra.module.js';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import { StockModule } from '../src/stock/stock.module.js';
import { crearAppPrueba, type AppPrueba } from './utilidades/app-prueba.js';
import { RabbitPrueba } from './utilidades/canal-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const OBRA_1 = 'c3d4e5f6-0000-4000-8000-000000000001';
const OBRA_2 = 'c3d4e5f6-0000-4000-8000-000000000002';
const OBRA_3 = 'c3d4e5f6-0000-4000-8000-000000000003';
/** No está en `obra_acceso`. */
const OBRA_DESCONOCIDA = 'c3d4e5f6-0000-4000-8000-000000000009';

describe('Resumen del stock para el tablero (e2e, 009)', () => {
  let prueba: AppPrueba;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    prueba = await crearAppPrueba(
      [AccesoObraModule, CatalogoModule, StockModule],
      new RabbitPrueba(),
    );
    tokens.admin = await prueba.claves.firmarConRoles(['admin']);
    tokens.gerente = await prueba.claves.firmarConRoles(['gerente']);
    tokens.residente = await prueba.claves.firmarConRoles(
      ['residente'],
      AZP.erp,
      { payload: { sub: 'residente-1' } },
    );
    tokens.residenteSinObras = await prueba.claves.firmarConRoles(
      ['residente'],
      AZP.erp,
      { payload: { sub: 'residente-9' } },
    );
    tokens.maestro = await prueba.claves.firmarConRoles(
      ['maestro'],
      AZP.appObra,
      { payload: { sub: 'maestro-1' } },
    );
    tokens.almacenero = await prueba.claves.firmarConRoles(
      ['almacenero'],
      AZP.appObra,
      { payload: { sub: 'almacenero-1' } },
    );
    tokens.cliente = await prueba.claves.firmarConRoles(
      ['cliente'],
      AZP.portal,
      { payload: { sub: 'cliente-1' } },
    );
    // Residente y cliente a la vez, entrando por el portal: solo cuenta `cliente`.
    tokens.residentePortal = await prueba.claves.firmarConRoles(
      ['residente', 'cliente'],
      AZP.portal,
      { payload: { sub: 'residente-1' } },
    );
  }, 300_000);

  afterAll(async () => {
    await prueba?.cerrar();
  });

  beforeEach(async () => {
    await prueba.vaciar();
    const acceso = (obraId: string, residente: string) => ({
      _id: obraId as never,
      nombre: `Obra ${obraId.slice(-1)}`,
      residente_id: residente,
      maestro_id: 'maestro-1',
      almacenero_id: 'almacenero-1',
      cliente_id: 'cliente-1',
      actualizado_en: new Date(),
    });
    await prueba.conexion
      .collection('obra_acceso')
      .insertMany([
        acceso(OBRA_1, 'residente-1'),
        acceso(OBRA_2, 'residente-2'),
        acceso(OBRA_3, 'residente-1'),
      ]);
    // Obra 1: 2 BAJO (uno negativo), 1 JUSTO (igual al mínimo), 1 OK.
    // Obra 2: 1 BAJO y 1 JUSTO (1,25 × mínimo). Obra 3: sin filas de stock.
    // Obra desconocida: tiene stock pero no está en obra_acceso.
    await prueba.conexion
      .collection('stock_obra')
      .insertMany([
        fila(OBRA_1, 'cemento', '5', '10'),
        fila(OBRA_1, 'arena', '-2.5', '0'),
        fila(OBRA_1, 'fierro', '100', '100'),
        fila(OBRA_1, 'grava', '200', '10'),
        fila(OBRA_2, 'cemento', '99.999', '100'),
        fila(OBRA_2, 'arena', '125', '100'),
        fila(OBRA_DESCONOCIDA, 'cemento', '0', '10'),
      ]);
  });

  const servidor = () => prueba.app.getHttpServer();
  const resumen = (obraIds: string | null, token = tokens.admin) => {
    const peticion = request(servidor())
      .get('/stock/resumen')
      .set('Authorization', `Bearer ${token}`);
    return obraIds === null ? peticion : peticion.query({ obraIds });
  };

  it('admin y gerente: materiales BAJO de cada obra pedida, en el orden pedido y sin repetir', async () => {
    for (const token of [tokens.admin, tokens.gerente]) {
      const respuesta = await resumen(
        `${OBRA_2},${OBRA_1},${OBRA_3},${OBRA_2}`,
        token,
      ).expect(200);
      expect(respuesta.body).toEqual([
        { obraId: OBRA_2, materialesBajos: 1 },
        { obraId: OBRA_1, materialesBajos: 2 },
        { obraId: OBRA_3, materialesBajos: 0 },
      ]);
    }
  });

  it('el estado se calcula al leer: cambiar el mínimo cambia el resumen', async () => {
    await prueba.conexion
      .collection('stock_obra')
      .updateOne(
        { _id: `${OBRA_1}:grava` as never },
        { $set: { minimo: decimal('500') } },
      );
    const respuesta = await resumen(OBRA_1).expect(200);
    expect(respuesta.body).toEqual([{ obraId: OBRA_1, materialesBajos: 3 }]);
  });

  it('obras que no están en obra_acceso se omiten sin error', async () => {
    const respuesta = await resumen(`${OBRA_DESCONOCIDA},${OBRA_1}`).expect(
      200,
    );
    expect(respuesta.body).toEqual([{ obraId: OBRA_1, materialesBajos: 2 }]);
  });

  it('residente: solo sus obras; las que no ve se omiten', async () => {
    const respuesta = await resumen(
      `${OBRA_1},${OBRA_2},${OBRA_3}`,
      tokens.residente,
    ).expect(200);
    expect(respuesta.body).toEqual([
      { obraId: OBRA_1, materialesBajos: 2 },
      { obraId: OBRA_3, materialesBajos: 0 },
    ]);
    const vacio = await resumen(
      `${OBRA_1},${OBRA_2}`,
      tokens.residenteSinObras,
    ).expect(200);
    expect(vacio.body).toEqual([]);
  });

  it('acepta espacios alrededor de los ids, comas sobrantes y el parámetro repetido', async () => {
    const conEspacios = await resumen(` ${OBRA_1} , ,${OBRA_2},`).expect(200);
    expect(conEspacios.body.map((f: { obraId: string }) => f.obraId)).toEqual([
      OBRA_1,
      OBRA_2,
    ]);
    const repetido = await request(servidor())
      .get(`/stock/resumen?obraIds=${OBRA_2}&obraIds=${OBRA_1},${OBRA_3}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    expect(repetido.body.map((f: { obraId: string }) => f.obraId)).toEqual([
      OBRA_2,
      OBRA_1,
      OBRA_3,
    ]);
  });

  it.each([
    ['sin obraIds', null],
    ['obraIds vacío', ''],
    ['solo comas', ' , ,'],
  ])('%s → 400 DATOS_INVALIDOS', async (_caso, obraIds) => {
    const respuesta = await resumen(obraIds).expect(400);
    expect(respuesta.body).toMatchObject({
      codigo: 'DATOS_INVALIDOS',
      errores: [expect.objectContaining({ campo: 'obraIds' })],
    });
  });

  it('hasta 100 obras; con 101 → 400 DATOS_INVALIDOS', async () => {
    const ids = (n: number) =>
      Array.from(
        { length: n },
        (_, i) =>
          `c3d4e5f6-0000-4000-8000-${String(i + 100).padStart(12, '0')}`,
      );
    await resumen([OBRA_1, ...ids(99)].join(',')).expect(200);
    const respuesta = await resumen(ids(101).join(',')).expect(400);
    expect(respuesta.body).toMatchObject({
      codigo: 'DATOS_INVALIDOS',
      errores: [expect.objectContaining({ campo: 'obraIds' })],
    });
  });

  it.each(['maestro', 'almacenero', 'cliente', 'residentePortal'])(
    '%s → 403 SIN_PERMISO',
    async (rol) => {
      const respuesta = await resumen(OBRA_1, tokens[rol]).expect(403);
      expect(respuesta.body.codigo).toBe('SIN_PERMISO');
    },
  );

  it('sin token → 401 NO_AUTENTICADO', async () => {
    const respuesta = await request(servidor())
      .get(`/stock/resumen?obraIds=${OBRA_1}`)
      .expect(401);
    expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
  });
});

function fila(
  obraId: string,
  materialId: string,
  cantidad: string,
  minimo: string,
) {
  return {
    _id: `${obraId}:${materialId}` as never,
    obra_id: obraId,
    material_id: materialId,
    cantidad: decimal(cantidad),
    minimo: decimal(minimo),
    version: 1,
    actualizado_en: new Date(),
  };
}

function decimal(valor: string): Types.Decimal128 {
  return Types.Decimal128.fromString(valor);
}
