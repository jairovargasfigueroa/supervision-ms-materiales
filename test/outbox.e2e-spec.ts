import { ConfigModule } from '@nestjs/config';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import { MensajeriaModule } from '../src/compartido/infraestructura/mensajeria/mensajeria.module.js';
import { Outbox } from '../src/compartido/infraestructura/mensajeria/outbox.js';
import {
  claveEvento,
  OutboxPublicador,
} from '../src/compartido/infraestructura/mensajeria/outbox.publicador.js';
import { OutboxEvento } from '../src/compartido/infraestructura/mensajeria/outbox.schema.js';
import { RabbitCliente } from '../src/compartido/infraestructura/mensajeria/rabbit.cliente.js';
import { Transaccion } from '../src/compartido/infraestructura/mongo/transaccion.js';
import { RabbitPrueba } from './utilidades/canal-prueba.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// MongoDB real en memoria (replica set) y un doble de RabbitCliente: el publicador se llama
// directo (`publicarPendientes`), sin esperar el temporizador de 1 s.
describe('Outbox (e2e)', () => {
  let mongo: MongoMemoryReplSet;
  let modulo: TestingModule;
  let rabbit: RabbitPrueba;
  let outbox: Outbox;
  let publicador: OutboxPublicador;
  let transaccion: Transaccion;
  let eventos: Model<OutboxEvento>;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    rabbit = new RabbitPrueba();
    modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        MongooseModule.forRoot(mongo.getUri('materiales_db')),
        MensajeriaModule,
      ],
    })
      .overrideProvider(RabbitCliente)
      .useValue(rabbit)
      .compile();
    modulo.useLogger(false);
    // Sin init(): el temporizador del publicador no arranca y la prueba decide cuándo publicar.
    outbox = modulo.get(Outbox);
    publicador = modulo.get(OutboxPublicador);
    transaccion = modulo.get(Transaccion);
    eventos = modulo.get(getModelToken(OutboxEvento.name));
    await eventos.createCollection();
    await eventos.syncIndexes();
  }, 300_000);

  afterAll(async () => {
    await modulo?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await eventos.deleteMany({});
    rabbit.reiniciar();
  });

  const agregar = (datos: Record<string, unknown>, correlacionId?: string) =>
    transaccion.ejecutar(() =>
      outbox.agregar('StockBajo', datos, correlacionId),
    );

  it('guarda el sobre común en outbox_evento, pendiente de publicar', async () => {
    const sobre = await agregar({
      obraId: 'o1',
      materialId: 'm1',
      cantidad: 0,
      minimo: 5,
    });

    expect(sobre).toEqual({
      id: expect.stringMatching(UUID),
      tipo: 'StockBajo',
      version: 1,
      ocurridoEn: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
      ),
      origen: 'materiales',
      correlacionId: sobre.id,
      datos: { obraId: 'o1', materialId: 'm1', cantidad: 0, minimo: 5 },
    });
    const guardado = await eventos.findById(sobre.id).lean();
    expect(guardado).toMatchObject({
      tipo: 'StockBajo',
      payload: sobre,
      publicado_en: null,
    });
    expect(guardado?.creado_en).toBeInstanceOf(Date);
  });

  it('usa el correlacionId del flujo si es un UUID; si no, el id del mensaje', async () => {
    const flujo = crypto.randomUUID();
    expect((await agregar({}, flujo)).correlacionId).toBe(flujo);
    const otro = await agregar({}, 'no-es-uuid');
    expect(otro.correlacionId).toBe(otro.id);
  });

  it('fuera de una transacción falla y no guarda nada', async () => {
    await expect(outbox.agregar('StockBajo', {})).rejects.toThrow(
      'El outbox se escribe dentro de una transacción.',
    );
    expect(await eventos.countDocuments()).toBe(0);
  });

  it('si la transacción falla después, el evento no queda', async () => {
    await expect(
      transaccion.ejecutar(async () => {
        await outbox.agregar('StockBajo', {});
        throw new Error('falla el dato');
      }),
    ).rejects.toThrow('falla el dato');
    expect(await eventos.countDocuments()).toBe(0);
  });

  it('publica los pendientes en orden al exchange con evento.materiales.<Tipo> y los marca publicados', async () => {
    const primero = await agregar({ n: 1 });
    const segundo = await agregar({ n: 2 });

    expect(await publicador.publicarPendientes()).toBe(2);

    expect(rabbit.publicados).toEqual([
      {
        clave: 'evento.materiales.StockBajo',
        cuerpo: primero,
        opciones: {
          persistent: true,
          contentType: 'application/json',
          messageId: primero.id,
        },
      },
      expect.objectContaining({ cuerpo: segundo }),
    ]);
    const marcados = await eventos.find({ publicado_en: { $ne: null } }).lean();
    expect(marcados).toHaveLength(2);
    // La vuelta siguiente no vuelve a publicarlos.
    expect(await publicador.publicarPendientes()).toBe(0);
    expect(rabbit.publicados).toHaveLength(2);
  });

  it('sin conexión a RabbitMQ no publica y los deja pendientes', async () => {
    rabbit.conectado = false;
    await agregar({});
    expect(await publicador.publicarPendientes()).toBe(0);
    expect(rabbit.publicados).toEqual([]);
    expect(await eventos.countDocuments({ publicado_en: null })).toBe(1);
  });

  it('si una publicación falla, se detiene y la reintenta en la vuelta siguiente sin saltarse el orden', async () => {
    const primero = await agregar({ n: 1 });
    const segundo = await agregar({ n: 2 });
    rabbit.fallarEn = 2;

    expect(await publicador.publicarPendientes()).toBe(1);
    expect(await eventos.findById(segundo.id).lean()).toMatchObject({
      publicado_en: null,
    });

    expect(await publicador.publicarPendientes()).toBe(1);
    expect(rabbit.publicados.map((p) => p.cuerpo.id)).toEqual([
      primero.id,
      segundo.id,
    ]);
    expect(await eventos.countDocuments({ publicado_en: null })).toBe(0);
  });

  it('claveEvento arma la clave de enrutamiento de los eventos de Materiales', () => {
    expect(claveEvento('MovimientoRegistrado')).toBe(
      'evento.materiales.MovimientoRegistrado',
    );
  });
});
