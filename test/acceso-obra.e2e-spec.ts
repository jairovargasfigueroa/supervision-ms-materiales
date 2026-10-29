import { ConfigModule } from '@nestjs/config';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import { AccesoObraModule } from '../src/acceso-obra/acceso-obra.module.js';
import { AccesoObraServicio } from '../src/acceso-obra/aplicacion/acceso-obra.servicio.js';
import {
  OBRA_ACCESO_REPOSITORIO,
  type ObraAccesoRepositorio,
} from '../src/acceso-obra/aplicacion/puertos/obra-acceso.repositorio.js';
import { ObraAcceso } from '../src/acceso-obra/dominio/obra-acceso.js';
import { ObraAccesoDocumento } from '../src/acceso-obra/infraestructura/obra-acceso.schema.js';
import {
  COLA,
  COLA_FALLIDOS,
  ConsumidorMensajes,
} from '../src/compartido/infraestructura/mensajeria/consumidor.js';
import { MensajeProcesado } from '../src/compartido/infraestructura/mensajeria/inbox.schema.js';
import { RabbitCliente } from '../src/compartido/infraestructura/mensajeria/rabbit.cliente.js';
import { Transaccion } from '../src/compartido/infraestructura/mongo/transaccion.js';
import {
  CanalPrueba,
  datosObraRegistrada,
  mensajePrueba,
  sobrePrueba,
} from './utilidades/canal-prueba.js';

const OBRA_ID = 'b2c3d4e5-0000-4000-8000-000000000001';

// MongoDB real en memoria (replica set, para las transacciones) y un doble del canal de
// RabbitMQ: el consumidor se llama directo con cada mensaje, sin servidor de RabbitMQ.
describe('Consumidor de ObraRegistrada y acceso a obras (e2e)', () => {
  let mongo: MongoMemoryReplSet;
  let modulo: TestingModule;
  let consumidor: ConsumidorMensajes;
  let obras: Model<ObraAccesoDocumento>;
  let procesados: Model<MensajeProcesado>;
  let canal: CanalPrueba;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        MongooseModule.forRoot(mongo.getUri('materiales_db')),
        AccesoObraModule,
      ],
    })
      .overrideProvider(RabbitCliente)
      .useValue({})
      .compile();
    modulo.useLogger(false);
    await modulo.init();
    consumidor = modulo.get(ConsumidorMensajes);
    obras = modulo.get(getModelToken(ObraAccesoDocumento.name));
    procesados = modulo.get(getModelToken(MensajeProcesado.name));
    // Las colecciones se crean antes de la primera transacción.
    await obras.createCollection();
    await procesados.createCollection();
  }, 300_000);

  afterAll(async () => {
    await modulo?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    canal = new CanalPrueba();
    vi.restoreAllMocks();
    await obras.deleteMany({});
    await procesados.deleteMany({});
  });

  const obraRegistrada = (cambios: Record<string, unknown> = {}, id?: string) =>
    sobrePrueba('ObraRegistrada', datosObraRegistrada(cambios), id);

  describe('ObraRegistrada', () => {
    it('guarda obra_acceso y el id del mensaje en mensaje_procesado', async () => {
      const sobre = obraRegistrada();
      const mensaje = mensajePrueba(sobre);

      await consumidor.procesar(mensaje, canal);

      const obra = await obras.findById(OBRA_ID).lean();
      expect(obra).toMatchObject({
        _id: OBRA_ID,
        nombre: 'Edificio Las Palmas',
        residente_id: 'residente-1',
        maestro_id: 'maestro-1',
        almacenero_id: 'almacenero-1',
        cliente_id: 'cliente-1',
      });
      expect(obra?.actualizado_en).toBeInstanceOf(Date);
      const procesado = await procesados.findById(sobre.id).lean();
      expect(procesado?.procesado_en).toBeInstanceOf(Date);
      expect(canal.confirmados).toEqual([mensaje]);
      expect(canal.publicados).toEqual([]);
    });

    it('el mismo mensaje dos veces no duplica ni vuelve a aplicarse', async () => {
      const id = crypto.randomUUID();
      await consumidor.procesar(mensajePrueba(obraRegistrada({}, id)), canal);
      await consumidor.procesar(
        mensajePrueba(obraRegistrada({ nombre: 'Otro nombre' }, id)),
        canal,
      );

      expect(await obras.countDocuments()).toBe(1);
      expect((await obras.findById(OBRA_ID).lean())?.nombre).toBe(
        'Edificio Las Palmas',
      );
      expect(await procesados.countDocuments()).toBe(1);
      expect(canal.confirmados).toHaveLength(2);
      expect(canal.publicados).toEqual([]);
    });

    it('el mismo mensaje a la vez dos veces se aplica una sola', async () => {
      const id = crypto.randomUUID();
      await Promise.all([
        consumidor.procesar(mensajePrueba(obraRegistrada({}, id)), canal),
        consumidor.procesar(mensajePrueba(obraRegistrada({}, id)), canal),
      ]);

      expect(await obras.countDocuments()).toBe(1);
      expect(await procesados.countDocuments()).toBe(1);
      expect(canal.confirmados).toHaveLength(2);
      expect(canal.publicados).toEqual([]);
    });

    it('otro mensaje de la misma obra reemplaza la copia (upsert)', async () => {
      await consumidor.procesar(mensajePrueba(obraRegistrada()), canal);
      await consumidor.procesar(
        mensajePrueba(
          obraRegistrada({
            nombre: 'Edificio Las Palmas II',
            asignaciones: {
              residenteId: 'residente-9',
              maestroId: 'maestro-1',
              almaceneroId: 'almacenero-1',
              clienteId: 'cliente-1',
            },
          }),
        ),
        canal,
      );

      expect(await obras.countDocuments()).toBe(1);
      expect(await obras.findById(OBRA_ID).lean()).toMatchObject({
        nombre: 'Edificio Las Palmas II',
        residente_id: 'residente-9',
      });
      expect(await procesados.countDocuments()).toBe(2);
    });

    it('datos incompletos van directo a plataforma.fallidos sin guardar nada', async () => {
      const sobre = obraRegistrada({ asignaciones: { residenteId: 'r' } });
      const mensaje = mensajePrueba(sobre);

      await consumidor.procesar(mensaje, canal);

      expect(await obras.countDocuments()).toBe(0);
      expect(await procesados.countDocuments()).toBe(0);
      expect(canal.publicados).toHaveLength(1);
      expect(canal.publicados[0]).toMatchObject({
        cola: COLA_FALLIDOS,
        cuerpo: sobre,
        opciones: {
          headers: {
            'x-error':
              'ObraRegistrada con datos incompletos: falta asignaciones.maestroId, asignaciones.almaceneroId, asignaciones.clienteId.',
            'x-cola-origen': COLA,
            'x-clave-origen': 'evento.obras.ObraRegistrada',
          },
        },
      });
      expect(canal.confirmados).toEqual([mensaje]);
    });

    it('si falla al guardar no queda en mensaje_procesado y se reintenta hasta aplicarse', async () => {
      const repositorio = modulo.get<ObraAccesoRepositorio>(
        OBRA_ACCESO_REPOSITORIO,
      );
      vi.spyOn(repositorio, 'guardar').mockRejectedValueOnce(
        new Error('MongoDB no responde'),
      );
      const sobre = obraRegistrada();

      await consumidor.procesar(mensajePrueba(sobre), canal);

      expect(await procesados.countDocuments()).toBe(0);
      expect(await obras.countDocuments()).toBe(0);
      expect(canal.publicados).toHaveLength(1);
      const reintento = canal.publicados[0];
      expect(reintento).toMatchObject({
        cola: COLA,
        opciones: { headers: { 'x-intentos': 1 } },
      });

      // RabbitMQ entrega el reintento por el exchange por defecto (clave = nombre de la cola).
      await consumidor.procesar(
        mensajePrueba(reintento.cuerpo, COLA, reintento.opciones.headers),
        canal,
      );

      expect(await obras.countDocuments()).toBe(1);
      expect(await procesados.findById(sobre.id).lean()).not.toBeNull();
      expect(canal.publicados).toHaveLength(1);
      expect(canal.confirmados).toHaveLength(2);
    });

    it('al tercer fallo va a plataforma.fallidos', async () => {
      const repositorio = modulo.get<ObraAccesoRepositorio>(
        OBRA_ACCESO_REPOSITORIO,
      );
      vi.spyOn(repositorio, 'guardar').mockRejectedValue(
        new Error('MongoDB no responde'),
      );

      let mensaje = mensajePrueba(obraRegistrada());
      for (let intento = 1; intento <= 3; intento++) {
        await consumidor.procesar(mensaje, canal);
        const ultimo = canal.publicados.at(-1)!;
        mensaje = mensajePrueba(ultimo.cuerpo, COLA, ultimo.opciones.headers);
      }

      expect(canal.publicados.map((p) => p.cola)).toEqual([
        COLA,
        COLA,
        COLA_FALLIDOS,
      ]);
      expect(canal.publicados[2].opciones.headers).toMatchObject({
        'x-intentos': 3,
        'x-error': 'MongoDB no responde',
        'x-clave-origen': 'evento.obras.ObraRegistrada',
      });
      expect(canal.confirmados).toHaveLength(3);
      expect(await procesados.countDocuments()).toBe(0);
    });
  });

  it.each(['CerrarConsumos', 'ReabrirConsumos'])(
    '%s (sin consumidor hasta la 008) se guarda en plataforma.fallidos',
    async (tipo) => {
      const sobre = sobrePrueba(tipo, {
        planillaId: 'p1',
        obraId: OBRA_ID,
        periodo: '2026-11',
      });

      await consumidor.procesar(
        mensajePrueba(sobre, `comando.materiales.${tipo}`),
        canal,
      );

      expect(canal.publicados).toEqual([
        expect.objectContaining({ cola: COLA_FALLIDOS, cuerpo: sobre }),
      ]);
      expect(canal.confirmados).toHaveLength(1);
      expect(await procesados.countDocuments()).toBe(0);
    },
  );

  it('las escrituras del repositorio entran en la transacción (si algo falla después, no queda nada)', async () => {
    const transaccion = modulo.get(Transaccion);
    const repositorio = modulo.get<ObraAccesoRepositorio>(
      OBRA_ACCESO_REPOSITORIO,
    );

    await expect(
      transaccion.ejecutar(async () => {
        await repositorio.guardar(
          new ObraAcceso(
            OBRA_ID,
            'x',
            {
              residenteId: 'r',
              maestroId: 'm',
              almaceneroId: 'a',
              clienteId: 'c',
            },
            new Date(),
          ),
        );
        throw new Error('falla después de guardar');
      }),
    ).rejects.toThrow('falla después de guardar');
    expect(await obras.countDocuments()).toBe(0);
  });

  describe('AccesoObraServicio con obra_acceso en MongoDB', () => {
    let acceso: AccesoObraServicio;

    beforeEach(async () => {
      acceso = modulo.get(AccesoObraServicio);
      await consumidor.procesar(mensajePrueba(obraRegistrada()), canal);
    });

    it('el almacenero asignado puede registrar movimientos tras ObraRegistrada (criterio 11)', async () => {
      await expect(
        acceso.exigirRegistrarMovimientos(OBRA_ID, {
          id: 'almacenero-1',
          roles: ['almacenero'],
          azp: 'app-obra',
        }),
      ).resolves.toMatchObject({ obraId: OBRA_ID });
    });

    it('otro almacenero recibe 404 OBRA_NO_ENCONTRADA', async () => {
      await expect(
        acceso.exigirRegistrarMovimientos(OBRA_ID, {
          id: 'almacenero-2',
          roles: ['almacenero'],
          azp: 'app-obra',
        }),
      ).rejects.toMatchObject({ codigo: 'OBRA_NO_ENCONTRADA', status: 404 });
    });

    it('el residente asignado ve la obra y el de otra obra no', async () => {
      await expect(
        acceso.exigirVer(OBRA_ID, {
          id: 'residente-1',
          roles: ['residente'],
          azp: 'erp',
        }),
      ).resolves.toMatchObject({ nombre: 'Edificio Las Palmas' });
      await expect(
        acceso.exigirVer(OBRA_ID, {
          id: 'residente-2',
          roles: ['residente'],
          azp: 'erp',
        }),
      ).rejects.toMatchObject({ codigo: 'OBRA_NO_ENCONTRADA' });
    });

    it('filtrarVisibles deja solo las obras que están en obra_acceso y ve el usuario', async () => {
      await expect(
        acceso.filtrarVisibles([OBRA_ID, 'otra-obra'], {
          id: 'g',
          roles: ['gerente'],
          azp: 'erp',
        }),
      ).resolves.toEqual([OBRA_ID]);
      await expect(
        acceso.filtrarVisibles([OBRA_ID], {
          id: 'cliente-2',
          roles: ['cliente'],
          azp: 'portal',
        }),
      ).resolves.toEqual([]);
    });
  });
});
