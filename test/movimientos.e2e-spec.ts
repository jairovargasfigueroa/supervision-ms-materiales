import request from 'supertest';
import { AccesoObraModule } from '../src/acceso-obra/acceso-obra.module.js';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import { CierresModule } from '../src/cierres/cierres.module.js';
import { Outbox } from '../src/compartido/infraestructura/mensajeria/outbox.js';
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
  let publicador: OutboxPublicador;

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
    publicador = prueba.modulo.get(OutboxPublicador);
    publicador.onModuleDestroy();
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

  describe('Eventos StockBajo y MovimientoRegistrado (outbox)', () => {
    const eventos = () =>
      prueba.conexion
        .collection('outbox_evento')
        .find({}, { sort: { creado_en: 1 } })
        .toArray();
    const fijarMinimo = (minimo: number) =>
      request(servidor())
        .put(`/obras/${OBRA_ID}/stock/${cementoId}/minimo`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ minimo })
        .expect(200);

    it('cada movimiento guarda MovimientoRegistrado y el publicador lo envía a RabbitMQ', async () => {
      const flujo = crypto.randomUUID();
      const cuerpo = salida({ cantidad: 3 });
      await registrar(ingreso({ cantidad: 10 })).expect(201);
      await prueba.conexion.collection('outbox_evento').deleteMany({});
      await registrar(cuerpo).set('X-Request-Id', flujo).expect(201);

      const [evento, ...otros] = await eventos();
      expect(otros).toEqual([]);
      expect(evento).toMatchObject({
        tipo: 'MovimientoRegistrado',
        publicado_en: null,
        payload: {
          id: evento._id,
          tipo: 'MovimientoRegistrado',
          version: 1,
          origen: 'materiales',
          correlacionId: flujo,
          datos: {
            movimientoId: cuerpo.id,
            obraId: OBRA_ID,
            materialId: cementoId,
            tipo: 'SALIDA',
            cantidad: 3,
            precioReferencial: 62,
            partidaId: PARTIDA_ID,
            periodo: '2026-11',
            superaStock: false,
            registradoEn: '2026-11-15T14:00:00.000Z',
          },
        },
      });

      expect(await publicador.publicarPendientes()).toBe(1);
      expect(rabbit.publicados).toEqual([
        {
          clave: 'evento.materiales.MovimientoRegistrado',
          cuerpo: evento.payload,
          opciones: {
            persistent: true,
            contentType: 'application/json',
            messageId: evento._id,
          },
        },
      ]);
    });

    it('un ingreso lleva partidaId null en el evento', async () => {
      await registrar(ingreso()).expect(201);
      const [evento] = await eventos();
      expect(evento.payload.datos).toMatchObject({
        tipo: 'INGRESO',
        partidaId: null,
        cantidad: 100,
      });
    });

    it('StockBajo solo al cruzar el mínimo (no se repite mientras sigue BAJO)', async () => {
      await registrar(ingreso({ cantidad: 120 })).expect(201);
      await fijarMinimo(100); // 120 con mínimo 100: JUSTO, sin aviso
      await registrar(salida({ cantidad: 20 })).expect(201); // 100: JUSTO
      await registrar(salida({ cantidad: 0.5 })).expect(201); // 99,5: BAJO (aviso)
      await registrar(salida({ cantidad: 10 })).expect(201); // 89,5: sigue BAJO
      await registrar(ingreso({ cantidad: 50 })).expect(201); // 139,5: OK
      await registrar(salida({ cantidad: 40 })).expect(201); // 99,5: BAJO (aviso)

      const lista = await eventos();
      expect(
        lista.filter((e) => e.tipo === 'StockBajo').map((e) => e.payload.datos),
      ).toEqual([
        { obraId: OBRA_ID, materialId: cementoId, cantidad: 99.5, minimo: 100 },
        { obraId: OBRA_ID, materialId: cementoId, cantidad: 99.5, minimo: 100 },
      ]);
      expect(
        lista.filter((e) => e.tipo === 'MovimientoRegistrado'),
      ).toHaveLength(6);
    });

    it('el mismo id dos veces publica una sola vez', async () => {
      const cuerpo = salida({ cantidad: 5 }); // supera el stock: BAJO
      await registrar(cuerpo).expect(201);
      await registrar(cuerpo).expect(200);
      expect((await eventos()).map((e) => e.tipo)).toEqual([
        'StockBajo',
        'MovimientoRegistrado',
      ]);
    });

    it('si falla guardar un evento, no queda el movimiento ni el cambio de stock', async () => {
      vi.spyOn(prueba.modulo.get(Outbox), 'agregar').mockRejectedValueOnce(
        new Error('MongoDB no responde'),
      );
      const respuesta = await registrar(ingreso()).expect(500);
      expect(respuesta.body.codigo).toBe('ERROR_INTERNO');
      expect(
        await prueba.conexion.collection('movimiento').countDocuments(),
      ).toBe(0);
      expect(await filaStock()).toBeNull();
      expect(await eventos()).toEqual([]);
    });
  });

  describe('GET /obras/{obraId}/movimientos', () => {
    const listar = (
      consulta = '',
      token = tokens.residente,
      obraId = OBRA_ID,
    ) =>
      request(servidor())
        .get('/obras/' + obraId + '/movimientos' + consulta)
        .set('Authorization', 'Bearer ' + token);

    it('lista paginada, del más reciente al más antiguo, con el formato del contrato', async () => {
      const primero = ingreso({ registradoEn: '2026-10-20T10:00:00Z' });
      const segundo = salida({
        registradoEn: '2026-11-02T10:00:00Z',
        cantidad: 200,
      });
      const tercero = ingreso({ registradoEn: '2026-11-15T10:00:00Z' });
      for (const cuerpo of [primero, segundo, tercero]) {
        await registrar(cuerpo).expect(201);
      }
      const respuesta = await listar().expect(200);
      expect(respuesta.body).toEqual({
        items: [
          {
            id: tercero.id,
            materialId: cementoId,
            tipo: 'INGRESO',
            cantidad: 100,
            partidaId: null,
            periodo: '2026-11',
            superaStock: false,
            cerrado: false,
            registradoPor: 'almacenero-1',
            registradoEn: '2026-11-15T10:00:00.000Z',
          },
          expect.objectContaining({
            id: segundo.id,
            tipo: 'SALIDA',
            partidaId: PARTIDA_ID,
            superaStock: true,
          }),
          expect.objectContaining({ id: primero.id, periodo: '2026-10' }),
        ],
        total: 3,
        pagina: 1,
        tamano: 20,
      });

      const noviembre = await listar(
        '?periodo=2026-11&tamano=1&pagina=2',
      ).expect(200);
      expect(noviembre.body).toMatchObject({ total: 2, pagina: 2, tamano: 1 });
      expect(noviembre.body.items.map((m: { id: string }) => m.id)).toEqual([
        segundo.id,
      ]);
      const asc = await listar('?direccion=asc').expect(200);
      expect(asc.body.items[0].id).toBe(primero.id);
    });

    it('parámetros inválidos → 400; tamano > 100 → 400 PAGINACION_INVALIDA', async () => {
      for (const consulta of [
        '?periodo=2026-13',
        '?periodo=nov',
        '?pagina=0',
        '?orden=cantidad',
        '?direccion=arriba',
      ]) {
        expect((await listar(consulta).expect(400)).body.codigo).toBe(
          'DATOS_INVALIDOS',
        );
      }
      expect((await listar('?tamano=101').expect(400)).body.codigo).toBe(
        'PAGINACION_INVALIDA',
      );
    });

    it.each(['admin', 'gerente', 'residente', 'maestro', 'almacenero'])(
      '%s (asignado o que ve todas) puede consultar',
      async (rol) => {
        await listar('', tokens[rol]).expect(200);
      },
    );

    it('almacenero no asignado u obra que no está en obra_acceso → 404 OBRA_NO_ENCONTRADA', async () => {
      expect(
        (await listar('', tokens.almacenero2).expect(404)).body.codigo,
      ).toBe('OBRA_NO_ENCONTRADA');
      expect(
        (await listar('', tokens.admin, OTRA_OBRA_ID).expect(404)).body.codigo,
      ).toBe('OBRA_NO_ENCONTRADA');
    });
  });

  describe('Validación, acceso y stock (pruebas de la spec 004)', () => {
    const errores = (cuerpo: { errores?: { campo: string }[] }) =>
      (cuerpo.errores ?? []).map((e) => e.campo);

    it('salida sin partida → 400 DATOS_INVALIDOS (partidaId)', async () => {
      const respuesta = await registrar(
        salida({ partidaId: undefined }),
      ).expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      expect(errores(respuesta.body)).toContain('partidaId');
      expect(
        await prueba.conexion.collection('movimiento').countDocuments(),
      ).toBe(0);
    });

    it.each([
      ['cantidad 0', { cantidad: 0 }, 'cantidad'],
      ['cantidad negativa', { cantidad: -1 }, 'cantidad'],
      ['cantidad con 4 decimales', { cantidad: 1.0001 }, 'cantidad'],
      ['cantidad como texto', { cantidad: '5' }, 'cantidad'],
      ['id que no es UUID v4', { id: 'mov-1' }, 'id'],
      ['tipo desconocido', { tipo: 'AJUSTE' }, 'tipo'],
      ['obraId que no es UUID', { obraId: 'obra-1' }, 'obraId'],
      ['materialId vacío', { materialId: '' }, 'materialId'],
      [
        'registradoEn sin zona',
        { registradoEn: '2026-11-15T14:00:00' },
        'registradoEn',
      ],
      ['registradoEn sin hora', { registradoEn: '2026-11-15' }, 'registradoEn'],
      ['registradoEn que falta', { registradoEn: undefined }, 'registradoEn'],
      ['partidaId en un ingreso', { partidaId: PARTIDA_ID }, 'partidaId'],
      [
        'nota de remisión vacía',
        { notaRemision: { numero: '  ' } },
        'notaRemision.numero',
      ],
    ])('%s → 400', async (_caso, cambios, campo) => {
      const respuesta = await registrar(ingreso(cambios)).expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      expect(errores(respuesta.body)).toContain(campo);
    });

    it('nota de remisión en una salida → 400', async () => {
      const respuesta = await registrar(
        salida({ notaRemision: { numero: 'NR-1' } }),
      ).expect(400);
      expect(errores(respuesta.body)).toContain('notaRemision');
    });

    it('acepta cantidades con 3 decimales y ingreso sin nota de remisión', async () => {
      const respuesta = await registrar(ingreso({ cantidad: 0.125 })).expect(
        201,
      );
      expect(respuesta.body.stock.cantidad).toBe(0.125);
      const guardado = await prueba.conexion
        .collection('movimiento')
        .findOne({ _id: respuesta.body.id as never });
      expect(guardado?.nota_remision).toBeNull();
    });

    it('almacenero no asignado → 404 OBRA_NO_ENCONTRADA (no se revela que existe)', async () => {
      const respuesta = await registrar(ingreso(), tokens.almacenero2).expect(
        404,
      );
      expect(respuesta.body.codigo).toBe('OBRA_NO_ENCONTRADA');
      const otra = await registrar(ingreso({ obraId: OTRA_OBRA_ID })).expect(
        404,
      );
      expect(otra.body.codigo).toBe('OBRA_NO_ENCONTRADA');
    });

    it('un id repetido de otra obra no se le devuelve a otro almacenero', async () => {
      const cuerpo = ingreso();
      await registrar(cuerpo).expect(201);
      const respuesta = await registrar(cuerpo, tokens.almacenero2).expect(404);
      expect(respuesta.body.codigo).toBe('OBRA_NO_ENCONTRADA');
    });

    it.each(['admin', 'gerente', 'residente', 'maestro'])(
      '%s (aunque esté asignado) → 403 SIN_PERMISO',
      async (rol) => {
        const respuesta = await registrar(ingreso(), tokens[rol]).expect(403);
        expect(respuesta.body.codigo).toBe('SIN_PERMISO');
      },
    );

    it('sin token → 401 NO_AUTENTICADO', async () => {
      await request(servidor())
        .post('/movimientos')
        .send(ingreso())
        .expect(401);
    });

    it('la primera salida de un material sin fila deja el stock negativo y avisa StockBajo', async () => {
      const respuesta = await registrar(salida({ cantidad: 2 })).expect(201);
      expect(respuesta.body).toMatchObject({
        superaStock: true,
        stock: { cantidad: -2, minimo: 0, estado: 'BAJO' },
      });
      const tipos = (
        await prueba.conexion.collection('outbox_evento').find().toArray()
      ).map((e) => e.tipo);
      expect(tipos.sort()).toEqual(['MovimientoRegistrado', 'StockBajo']);
    });

    it('el stock de la obra (GET /obras/{id}/stock) refleja los movimientos', async () => {
      await registrar(ingreso({ cantidad: 130 })).expect(201);
      await request(servidor())
        .put('/obras/' + OBRA_ID + '/stock/' + cementoId + '/minimo')
        .set('Authorization', 'Bearer ' + tokens.admin)
        .send({ minimo: 100 })
        .expect(200);
      await registrar(salida({ cantidad: 20.5 })).expect(201);
      const respuesta = await request(servidor())
        .get('/obras/' + OBRA_ID + '/stock')
        .set('Authorization', 'Bearer ' + tokens.almacenero)
        .expect(200);
      expect(respuesta.body).toEqual([
        expect.objectContaining({
          materialId: cementoId,
          cantidad: 109.5,
          minimo: 100,
          estado: 'JUSTO',
        }),
      ]);
    });

    it('un envío repetido después de cerrar el periodo o desactivar el material sigue dando 200', async () => {
      const cuerpo = ingreso();
      await registrar(cuerpo).expect(201);
      await cerrarPeriodo('2026-11');
      await request(servidor())
        .put('/materiales/' + cementoId)
        .set('Authorization', 'Bearer ' + tokens.admin)
        .send({ ...cemento, activo: false })
        .expect(200);
      const respuesta = await registrar(cuerpo).expect(200);
      expect(respuesta.body).toMatchObject({
        id: cuerpo.id,
        periodo: '2026-11',
      });
    });
  });
});
