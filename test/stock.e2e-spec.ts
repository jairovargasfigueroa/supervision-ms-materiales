import { Types } from 'mongoose';
import request from 'supertest';
import { AccesoObraModule } from '../src/acceso-obra/acceso-obra.module.js';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import { StockModule } from '../src/stock/stock.module.js';
import { crearAppPrueba, type AppPrueba } from './utilidades/app-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const OBRA_ID = 'b2c3d4e5-0000-4000-8000-000000000001';
const OTRA_OBRA_ID = 'b2c3d4e5-0000-4000-8000-000000000002';

const cemento = {
  codigo: 'CEM-IP30',
  nombre: 'Cemento IP-30',
  tipo: 'CEMENTO',
  unidad: 'bolsa',
  unidadPlural: 'bolsas',
  precioReferencial: 62,
};

describe('Stock por obra (e2e)', () => {
  let prueba: AppPrueba;
  const tokens: Record<string, string> = {};
  let cementoId: string;

  beforeAll(async () => {
    prueba = await crearAppPrueba([
      AccesoObraModule,
      CatalogoModule,
      StockModule,
    ]);
    tokens.admin = await prueba.claves.firmarConRoles(['admin']);
    tokens.gerente = await prueba.claves.firmarConRoles(['gerente']);
    for (const [rol, sub, azp] of [
      ['residente', 'residente-1', AZP.erp],
      ['maestro', 'maestro-1', AZP.appObra],
      ['almacenero', 'almacenero-1', AZP.appObra],
    ] as const) {
      tokens[rol] = await prueba.claves.firmarConRoles([rol], azp, {
        payload: { sub },
      });
    }
    tokens.residente2 = await prueba.claves.firmarConRoles(
      ['residente'],
      AZP.erp,
      {
        payload: { sub: 'residente-2' },
      },
    );
    tokens.cliente = await prueba.claves.firmarConRoles(
      ['cliente'],
      AZP.portal,
      {
        payload: { sub: 'cliente-1' },
      },
    );
  }, 300_000);

  afterAll(async () => {
    await prueba?.cerrar();
  });

  beforeEach(async () => {
    await prueba.vaciar();
    await prueba.conexion.collection('obra_acceso').insertOne({
      _id: OBRA_ID as never,
      nombre: 'Edificio Las Palmas',
      residente_id: 'residente-1',
      maestro_id: 'maestro-1',
      almacenero_id: 'almacenero-1',
      cliente_id: 'cliente-1',
      actualizado_en: new Date(),
    });
    const { body } = await request(servidor())
      .post('/materiales')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send(cemento)
      .expect(201);
    cementoId = body.id;
  });

  const servidor = () => prueba.app.getHttpServer();
  const verStock = (obraId = OBRA_ID, token = tokens.admin) =>
    request(servidor())
      .get(`/obras/${obraId}/stock`)
      .set('Authorization', `Bearer ${token}`);
  const fijarMinimo = (
    minimo: unknown,
    materialId = cementoId,
    obraId = OBRA_ID,
    token = tokens.admin,
  ) =>
    request(servidor())
      .put(`/obras/${obraId}/stock/${materialId}/minimo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ minimo });

  /** Deja la cantidad como la dejarían los movimientos (004). */
  const ponerCantidad = (cantidad: string, materialId = cementoId) =>
    prueba.conexion
      .collection('stock_obra')
      .updateOne(
        { _id: `${OBRA_ID}:${materialId}` as never },
        { $set: { cantidad: decimal(cantidad) } },
      );

  describe('PUT /obras/{obraId}/stock/{materialId}/minimo', () => {
    it('agrega el material a la obra con cantidad 0 (upsert) y responde la fila', async () => {
      const respuesta = await fijarMinimo(100).expect(200);
      expect(respuesta.body).toEqual({
        materialId: cementoId,
        codigo: 'CEM-IP30',
        nombre: 'Cemento IP-30',
        unidad: 'bolsa',
        unidadPlural: 'bolsas',
        cantidad: 0,
        minimo: 100,
        estado: 'BAJO',
      });
      const fila = await prueba.conexion
        .collection('stock_obra')
        .findOne({ _id: `${OBRA_ID}:${cementoId}` as never });
      expect(fila).toMatchObject({
        obra_id: OBRA_ID,
        material_id: cementoId,
        version: 1,
      });
      expect(fila?.cantidad.toString()).toBe('0');
      expect(fila?.minimo.toString()).toBe('100');
    });

    it('cambiar el mínimo no toca la cantidad y sube la versión', async () => {
      await fijarMinimo(100).expect(200);
      await ponerCantidad('130.5');
      const respuesta = await fijarMinimo(110.25).expect(200);
      expect(respuesta.body).toMatchObject({
        cantidad: 130.5,
        minimo: 110.25,
        estado: 'JUSTO',
      });
      const fila = await prueba.conexion
        .collection('stock_obra')
        .findOne({ _id: `${OBRA_ID}:${cementoId}` as never });
      expect(fila?.version).toBe(2);
      expect(
        await prueba.conexion.collection('stock_obra').countDocuments(),
      ).toBe(1);
    });

    it('mínimo 0 es válido; negativo, con más de 3 decimales o sin número → 400', async () => {
      await fijarMinimo(0).expect(200);
      for (const minimo of [-1, 1.0001, '5', null]) {
        const respuesta = await fijarMinimo(minimo).expect(400);
        expect(respuesta.body).toMatchObject({
          codigo: 'DATOS_INVALIDOS',
          errores: expect.arrayContaining([
            expect.objectContaining({ campo: 'minimo' }),
          ]),
        });
      }
    });

    it('obra que no está en obra_acceso → 404 OBRA_NO_ENCONTRADA', async () => {
      const respuesta = await fijarMinimo(1, cementoId, OTRA_OBRA_ID).expect(
        404,
      );
      expect(respuesta.body.codigo).toBe('OBRA_NO_ENCONTRADA');
    });

    it('material que no existe → 404 MATERIAL_NO_ENCONTRADO', async () => {
      const respuesta = await fijarMinimo(1, 'no-existe').expect(404);
      expect(respuesta.body.codigo).toBe('MATERIAL_NO_ENCONTRADO');
    });

    it('material desactivado → 422 MATERIAL_INACTIVO', async () => {
      await request(servidor())
        .put(`/materiales/${cementoId}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ ...cemento, activo: false })
        .expect(200);
      const respuesta = await fijarMinimo(1).expect(422);
      expect(respuesta.body.codigo).toBe('MATERIAL_INACTIVO');
      expect(
        await prueba.conexion.collection('stock_obra').countDocuments(),
      ).toBe(0);
    });

    it.each(['gerente', 'residente', 'maestro', 'almacenero'])(
      '%s no puede fijar el mínimo → 403 SIN_PERMISO',
      async (rol) => {
        const respuesta = await fijarMinimo(
          1,
          cementoId,
          OBRA_ID,
          tokens[rol],
        ).expect(403);
        expect(respuesta.body.codigo).toBe('SIN_PERMISO');
      },
    );
  });

  describe('GET /obras/{obraId}/stock', () => {
    it('lista los materiales con mínimo o movimientos de la obra', async () => {
      await verStock().expect(200, []);
      await fijarMinimo(100).expect(200);
      await ponerCantidad('120');
      const respuesta = await verStock().expect(200);
      expect(respuesta.body).toEqual([
        expect.objectContaining({
          materialId: cementoId,
          cantidad: 120,
          minimo: 100,
          estado: 'JUSTO',
        }),
      ]);
    });

    it.each(['admin', 'gerente', 'residente', 'maestro', 'almacenero'])(
      '%s (asignado o que ve todas) ve el stock',
      async (rol) => {
        await verStock(OBRA_ID, tokens[rol]).expect(200);
      },
    );

    it('residente no asignado → 404 OBRA_NO_ENCONTRADA (no se revela que existe)', async () => {
      const respuesta = await verStock(OBRA_ID, tokens.residente2).expect(404);
      expect(respuesta.body.codigo).toBe('OBRA_NO_ENCONTRADA');
    });

    it('obra que no está en obra_acceso → 404 OBRA_NO_ENCONTRADA, también para admin', async () => {
      const respuesta = await verStock(OTRA_OBRA_ID).expect(404);
      expect(respuesta.body.codigo).toBe('OBRA_NO_ENCONTRADA');
    });

    it('cliente (portal) → 403 SIN_PERMISO', async () => {
      await verStock(OBRA_ID, tokens.cliente).expect(403);
    });
  });
});

/** Igual que lo escribe el servicio (`Decimal128`). */
function decimal(valor: string): Types.Decimal128 {
  return Types.Decimal128.fromString(valor);
}
