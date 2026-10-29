import request from 'supertest';
import { AccesoObraModule } from '../src/acceso-obra/acceso-obra.module.js';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import { CierresModule } from '../src/cierres/cierres.module.js';
import { OutboxPublicador } from '../src/compartido/infraestructura/mensajeria/outbox.publicador.js';
import { MovimientosModule } from '../src/movimientos/movimientos.module.js';
import { StockModule } from '../src/stock/stock.module.js';
import { crearAppPrueba, type AppPrueba } from './utilidades/app-prueba.js';
import { RabbitPrueba } from './utilidades/canal-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const OBRA_ID = 'b2c3d4e5-0000-4000-8000-000000000001';
const OTRA_OBRA_ID = 'b2c3d4e5-0000-4000-8000-000000000002';
const PARTIDA_ID = 'c3d4e5f6-0000-4000-8000-000000000001';

const cemento = {
  codigo: 'CEM-IP30',
  nombre: 'Cemento IP-30',
  tipo: 'CEMENTO',
  unidad: 'bolsa',
  unidadPlural: 'bolsas',
  precioReferencial: 62,
};

describe('Movimientos de material (e2e)', () => {
  let prueba: AppPrueba;
  const tokens: Record<string, string> = {};
  let cementoId: string;
  let rabbit: RabbitPrueba;

  beforeAll(async () => {
    rabbit = new RabbitPrueba();
    prueba = await crearAppPrueba(
      [
        AccesoObraModule,
        CatalogoModule,
        StockModule,
        CierresModule,
        MovimientosModule,
      ],
      rabbit,
    );
    // Sin el temporizador de 1 s: cada prueba publica cuando quiere (publicarPendientes).
    prueba.modulo.get(OutboxPublicador).onModuleDestroy();
    tokens.admin = await prueba.claves.firmarConRoles(['admin']);
    tokens.gerente = await prueba.claves.firmarConRoles(['gerente']);
    for (const [nombre, rol, sub, azp] of [
      ['residente', 'residente', 'residente-1', AZP.erp],
      ['maestro', 'maestro', 'maestro-1', AZP.appObra],
      ['almacenero', 'almacenero', 'almacenero-1', AZP.appObra],
      ['almacenero2', 'almacenero', 'almacenero-2', AZP.appObra],
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
  const registrar = (
    cuerpo: Record<string, unknown>,
    token = tokens.almacenero,
  ) =>
    request(servidor())
      .post('/movimientos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpo);
  const ingreso = (cambios: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(),
    obraId: OBRA_ID,
    materialId: cementoId,
    tipo: 'INGRESO',
    cantidad: 100,
    registradoEn: '2026-11-15T14:00:00Z',
    ...cambios,
  });
  const salida = (cambios: Record<string, unknown> = {}) =>
    ingreso({
      tipo: 'SALIDA',
      cantidad: 12.5,
      partidaId: PARTIDA_ID,
      ...cambios,
    });
  const filaStock = () =>
    prueba.conexion
      .collection('stock_obra')
      .findOne({ _id: `${OBRA_ID}:${cementoId}` as never });
  const cerrarPeriodo = (
    periodo: string,
    obraId = OBRA_ID,
    estado = 'CERRADO',
  ) =>
    // `cierre_periodo` lo escribe la 008; aquí se inserta a mano.
    prueba.conexion.collection('cierre_periodo').insertOne({
      _id: `${obraId}:${periodo}` as never,
      planilla_id: crypto.randomUUID(),
      estado,
      cerrado_en: new Date(),
    });

  describe('POST /movimientos', () => {
    it('un ingreso suma al stock y responde 201 con el periodo y el stock', async () => {
      const cuerpo = ingreso({ notaRemision: { numero: ' NR-00123 ' } });
      const respuesta = await registrar(cuerpo).expect(201);
      expect(respuesta.body).toEqual({
        id: cuerpo.id,
        periodo: '2026-11',
        superaStock: false,
        stock: { cantidad: 100, minimo: 0, estado: 'OK' },
      });
      const guardado = await prueba.conexion
        .collection('movimiento')
        .findOne({ _id: cuerpo.id as never });
      expect(guardado).toMatchObject({
        obra_id: OBRA_ID,
        material_id: cementoId,
        tipo: 'INGRESO',
        partida_id: null,
        periodo: '2026-11',
        cerrado: false,
        supera_stock: false,
        registrado_por: 'almacenero-1',
        registrado_en: new Date('2026-11-15T14:00:00Z'),
        nota_remision: { numero: 'NR-00123', clave_foto: null },
      });
      expect(guardado?.cantidad.toString()).toBe('100');
      const fila = await filaStock();
      expect(fila?.cantidad.toString()).toBe('100');
      expect(fila?.version).toBe(1);
    });

    it('una salida resta del stock y guarda la partida', async () => {
      await registrar(ingreso()).expect(201);
      const cuerpo = salida();
      const respuesta = await registrar(cuerpo).expect(201);
      expect(respuesta.body).toMatchObject({
        superaStock: false,
        stock: { cantidad: 87.5 },
      });
      expect(
        await prueba.conexion
          .collection('movimiento')
          .findOne({ _id: cuerpo.id as never }),
      ).toMatchObject({ partida_id: PARTIDA_ID, tipo: 'SALIDA' });
      const fila = await filaStock();
      expect(fila?.cantidad.toString()).toBe('87.5');
      expect(fila?.version).toBe(2);
    });

    it('una salida mayor que el stock se registra igual con superaStock', async () => {
      await registrar(ingreso({ cantidad: 10 })).expect(201);
      const cuerpo = salida({ cantidad: 10.5 });
      const respuesta = await registrar(cuerpo).expect(201);
      expect(respuesta.body).toMatchObject({
        superaStock: true,
        stock: { cantidad: -0.5, estado: 'BAJO' },
      });
      expect(
        await prueba.conexion
          .collection('movimiento')
          .findOne({ _id: cuerpo.id as never }),
      ).toMatchObject({ supera_stock: true });
    });

    it('el mismo id dos veces: 201 y luego 200 con el existente, sin sumar dos veces', async () => {
      const cuerpo = ingreso();
      const primera = await registrar(cuerpo).expect(201);
      const segunda = await registrar({ ...cuerpo, cantidad: 999 }).expect(200);
      expect(segunda.body).toEqual(primera.body);
      expect(
        await prueba.conexion.collection('movimiento').countDocuments(),
      ).toBe(1);
      expect((await filaStock())?.cantidad.toString()).toBe('100');
    });

    it('el mismo id enviado a la vez se registra una sola vez', async () => {
      const cuerpo = ingreso();
      const respuestas = await Promise.all(
        [1, 2, 3].map(() => registrar(cuerpo)),
      );
      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 200, 201]);
      expect(
        await prueba.conexion.collection('movimiento').countDocuments(),
      ).toBe(1);
      expect((await filaStock())?.cantidad.toString()).toBe('100');
    });

    it('movimientos distintos a la vez sobre el mismo material suman todos (versión)', async () => {
      await registrar(ingreso({ cantidad: 1 })).expect(201);
      const respuestas = await Promise.all(
        Array.from({ length: 5 }, () => registrar(ingreso({ cantidad: 2 }))),
      );
      expect(respuestas.map((r) => r.status)).toEqual([
        201, 201, 201, 201, 201,
      ]);
      const fila = await filaStock();
      expect(fila?.cantidad.toString()).toBe('11');
      expect(fila?.version).toBe(6);
    });

    it('el periodo es el mes en America/La_Paz; un periodo cerrado → 409 PERIODO_CERRADO', async () => {
      await cerrarPeriodo('2026-11');
      // 1 de diciembre 02:00 UTC = 30 de noviembre 22:00 en La Paz
      const respuesta = await registrar(
        ingreso({ registradoEn: '2026-12-01T02:00:00Z' }),
      ).expect(409);
      expect(respuesta.body).toMatchObject({
        codigo: 'PERIODO_CERRADO',
        detail: 'El periodo 2026-11 ya está cerrado',
      });
      expect(
        await prueba.conexion.collection('movimiento').countDocuments(),
      ).toBe(0);
      expect(await filaStock()).toBeNull();

      const otroMes = await registrar(
        ingreso({ registradoEn: '2026-12-01T04:00:00Z' }),
      ).expect(201);
      expect(otroMes.body.periodo).toBe('2026-12');
    });

    it('un periodo REABIERTO o de otra obra no rechaza', async () => {
      await cerrarPeriodo('2026-11', OBRA_ID, 'REABIERTO');
      await cerrarPeriodo('2026-10', OTRA_OBRA_ID);
      await registrar(ingreso()).expect(201);
      await registrar(ingreso({ registradoEn: '2026-10-15T14:00:00Z' })).expect(
        201,
      );
    });

    it('material desactivado → 422 MATERIAL_INACTIVO; inexistente → 404 MATERIAL_NO_ENCONTRADO', async () => {
      await request(servidor())
        .put(`/materiales/${cementoId}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ ...cemento, activo: false })
        .expect(200);
      expect((await registrar(ingreso()).expect(422)).body.codigo).toBe(
        'MATERIAL_INACTIVO',
      );
      expect(
        (await registrar(ingreso({ materialId: 'no-existe' })).expect(404)).body
          .codigo,
      ).toBe('MATERIAL_NO_ENCONTRADO');
      expect(await filaStock()).toBeNull();
    });
  });
});
