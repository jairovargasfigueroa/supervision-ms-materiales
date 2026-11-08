import { Types } from 'mongoose';
import request from 'supertest';
import { AccesoObraModule } from '../src/acceso-obra/acceso-obra.module.js';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import { Outbox } from '../src/compartido/infraestructura/mensajeria/outbox.js';
import { OutboxPublicador } from '../src/compartido/infraestructura/mensajeria/outbox.publicador.js';
import { StockModule } from '../src/stock/stock.module.js';
import { crearAppPrueba, type AppPrueba } from './utilidades/app-prueba.js';
import { RabbitPrueba } from './utilidades/canal-prueba.js';
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
  let rabbit: RabbitPrueba;
  let publicador: OutboxPublicador;

  beforeAll(async () => {
    rabbit = new RabbitPrueba();
    prueba = await crearAppPrueba(
      [AccesoObraModule, CatalogoModule, StockModule],
      rabbit,
    );
    publicador = prueba.modulo.get(OutboxPublicador);
    // Sin el temporizador de 1 s: cada prueba publica cuando quiere (publicarPendientes).
    publicador.onModuleDestroy();
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
    vi.restoreAllMocks();
    rabbit.reiniciar();
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

  describe('Estados en los bordes (reglas del negocio)', () => {
    it.each([
      ['99.999', 'BAJO'],
      ['100', 'JUSTO'], // igual al mínimo
      ['125', 'JUSTO'], // 1,25 × mínimo
      ['125.001', 'OK'], // por encima
    ])('cantidad %s con mínimo 100 → %s', async (cantidad, estado) => {
      await fijarMinimo(100).expect(200);
      await ponerCantidad(cantidad);
      const respuesta = await verStock().expect(200);
      expect(respuesta.body).toEqual([
        expect.objectContaining({
          cantidad: Number(cantidad),
          minimo: 100,
          estado,
        }),
      ]);
    });
  });

  describe('StockBajo (outbox)', () => {
    const eventos = () =>
      prueba.conexion
        .collection('outbox_evento')
        .find({}, { sort: { creado_en: 1 } })
        .toArray();

    it('fijar un mínimo que deja el stock BAJO guarda StockBajo y el publicador lo envía a RabbitMQ', async () => {
      const flujo = crypto.randomUUID();
      await fijarMinimo(100).set('X-Request-Id', flujo).expect(200);

      const [evento, ...otros] = await eventos();
      expect(otros).toEqual([]);
      expect(evento).toMatchObject({
        tipo: 'StockBajo',
        publicado_en: null,
        payload: {
          id: evento._id,
          tipo: 'StockBajo',
          version: 1,
          origen: 'materiales',
          correlacionId: flujo,
          datos: {
            obraId: OBRA_ID,
            materialId: cementoId,
            cantidad: 0,
            minimo: 100,
          },
        },
      });

      expect(await publicador.publicarPendientes()).toBe(1);
      expect(rabbit.publicados).toEqual([
        {
          clave: 'evento.materiales.StockBajo',
          cuerpo: evento.payload,
          opciones: {
            persistent: true,
            contentType: 'application/json',
            messageId: evento._id,
          },
        },
      ]);
      expect((await eventos())[0].publicado_en).toBeInstanceOf(Date);
    });

    it('si ya estaba BAJO no se vuelve a publicar; al volver a cruzar, sí', async () => {
      await fijarMinimo(100).expect(200); // 0 < 100: BAJO (1)
      await fijarMinimo(150).expect(200); // sigue BAJO
      await ponerCantidad('150');
      await fijarMinimo(150).expect(200); // JUSTO
      await fijarMinimo(150.001).expect(200); // BAJO otra vez (2)

      const lista = await eventos();
      expect(lista.map((e) => e.payload.datos)).toEqual([
        { obraId: OBRA_ID, materialId: cementoId, cantidad: 0, minimo: 100 },
        {
          obraId: OBRA_ID,
          materialId: cementoId,
          cantidad: 150,
          minimo: 150.001,
        },
      ]);
    });

    it('un mínimo que no deja el stock BAJO no publica nada', async () => {
      await fijarMinimo(0).expect(200); // cantidad 0 = mínimo 0: JUSTO
      await ponerCantidad('80');
      await fijarMinimo(70).expect(200); // OK
      expect(await eventos()).toEqual([]);
    });

    it('los errores (404, 422, 403) no guardan nada', async () => {
      await fijarMinimo(100, 'no-existe').expect(404);
      await fijarMinimo(100, cementoId, OTRA_OBRA_ID).expect(404);
      await fijarMinimo(100, cementoId, OBRA_ID, tokens.gerente).expect(403);
      expect(await eventos()).toEqual([]);
      expect(
        await prueba.conexion.collection('stock_obra').countDocuments(),
      ).toBe(0);
    });

    it('si falla guardar el evento, tampoco queda el mínimo (misma transacción)', async () => {
      vi.spyOn(prueba.modulo.get(Outbox), 'agregar').mockRejectedValueOnce(
        new Error('MongoDB no responde'),
      );
      const respuesta = await fijarMinimo(100).expect(500);
      expect(respuesta.body.codigo).toBe('ERROR_INTERNO');
      expect(
        await prueba.conexion.collection('stock_obra').countDocuments(),
      ).toBe(0);
      expect(await eventos()).toEqual([]);
    });

    it('sin conexión a RabbitMQ queda pendiente y sale al reconectar', async () => {
      rabbit.conectado = false;
      await fijarMinimo(100).expect(200);
      expect(await publicador.publicarPendientes()).toBe(0);
      rabbit.conectado = true;
      expect(await publicador.publicarPendientes()).toBe(1);
      expect(rabbit.publicados).toHaveLength(1);
    });
  });
});

/** Igual que lo escribe el servicio (`Decimal128`). */
function decimal(valor: string): Types.Decimal128 {
  return Types.Decimal128.fromString(valor);
}
