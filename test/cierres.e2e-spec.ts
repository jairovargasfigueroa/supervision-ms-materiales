import request from 'supertest';
import { AccesoObraModule } from '../src/acceso-obra/acceso-obra.module.js';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import {
  MOVIMIENTOS_PERIODO_REPOSITORIO,
  type MovimientosPeriodoRepositorio,
} from '../src/cierres/aplicacion/puertos/movimientos-periodo.repositorio.js';
import { CierresModule } from '../src/cierres/cierres.module.js';
import {
  COLA,
  COLA_FALLIDOS,
  ConsumidorMensajes,
} from '../src/compartido/infraestructura/mensajeria/consumidor.js';
import { OutboxPublicador } from '../src/compartido/infraestructura/mensajeria/outbox.publicador.js';
import { MovimientosModule } from '../src/movimientos/movimientos.module.js';
import { StockModule } from '../src/stock/stock.module.js';
import { crearAppPrueba, type AppPrueba } from './utilidades/app-prueba.js';
import {
  CanalPrueba,
  mensajePrueba,
  RabbitPrueba,
  sobrePrueba,
} from './utilidades/canal-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const OBRA_ID = 'b2c3d4e5-0000-4000-8000-000000000001';
const OTRA_OBRA_ID = 'b2c3d4e5-0000-4000-8000-000000000002';
const PARTIDA_ID = 'c3d4e5f6-0000-4000-8000-000000000001';
const PLANILLA_ID = 'd4e5f6a7-0000-4000-8000-000000000001';
const OTRA_PLANILLA_ID = 'd4e5f6a7-0000-4000-8000-000000000002';
const PERIODO = '2026-11';
/** Ids (UUID v4, como los genera el celular) de los movimientos de prueba. */
const MOV = {
  ingreso: 'e5f6a7b8-0000-4000-8000-000000000001',
  salida: 'e5f6a7b8-0000-4000-8000-000000000002',
  diciembre: 'e5f6a7b8-0000-4000-8000-000000000003',
  otraObra: 'e5f6a7b8-0000-4000-8000-000000000004',
};

// MongoDB real en memoria (replica set), doble del canal de RabbitMQ para entregar los comandos
// al consumidor y doble de RabbitCliente para ver lo que publica el outbox.
describe('Cierre de consumos de la saga (e2e)', () => {
  let prueba: AppPrueba;
  let consumidor: ConsumidorMensajes;
  let publicador: OutboxPublicador;
  let rabbit: RabbitPrueba;
  let canal: CanalPrueba;
  const tokens: Record<string, string> = {};
  let cementoId: string;

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
    publicador = prueba.modulo.get(OutboxPublicador);
    publicador.onModuleDestroy();
    consumidor = prueba.modulo.get(ConsumidorMensajes);
    tokens.admin = await prueba.claves.firmarConRoles(['admin']);
    tokens.almacenero = await prueba.claves.firmarConRoles(
      ['almacenero'],
      AZP.appObra,
      { payload: { sub: 'almacenero-1' } },
    );
  }, 300_000);

  afterAll(async () => {
    await prueba?.cerrar();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    rabbit.reiniciar();
    canal = new CanalPrueba();
    await prueba.vaciar();
    for (const obraId of [OBRA_ID, OTRA_OBRA_ID]) {
      await prueba.conexion.collection('obra_acceso').insertOne({
        _id: obraId as never,
        nombre: 'Edificio Las Palmas',
        residente_id: 'residente-1',
        maestro_id: 'maestro-1',
        almacenero_id: 'almacenero-1',
        cliente_id: 'cliente-1',
        actualizado_en: new Date(),
      });
    }
    const { body } = await request(servidor())
      .post('/materiales')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        codigo: 'CEM-IP30',
        nombre: 'Cemento IP-30',
        tipo: 'CEMENTO',
        unidad: 'bolsa',
        unidadPlural: 'bolsas',
        precioReferencial: 62,
      })
      .expect(201);
    cementoId = body.id;
  });

  const servidor = () => prueba.app.getHttpServer();

  const registrar = (cambios: Record<string, unknown> = {}) =>
    request(servidor())
      .post('/movimientos')
      .set('Authorization', `Bearer ${tokens.almacenero}`)
      .send({
        id: crypto.randomUUID(),
        obraId: OBRA_ID,
        materialId: cementoId,
        tipo: 'INGRESO',
        cantidad: 100,
        registradoEn: '2026-11-15T14:00:00Z',
        ...cambios,
      });

  /** Dos movimientos de la obra en 2026-11, uno en 2026-12 y uno de otra obra en 2026-11. */
  const registrarMovimientos = async () => {
    await registrar({ id: MOV.ingreso }).expect(201);
    await registrar({
      id: MOV.salida,
      tipo: 'SALIDA',
      cantidad: 12.5,
      partidaId: PARTIDA_ID,
    }).expect(201);
    await registrar({
      id: MOV.diciembre,
      registradoEn: '2026-12-10T14:00:00Z',
    }).expect(201);
    await registrar({ id: MOV.otraObra, obraId: OTRA_OBRA_ID }).expect(201);
    // Los MovimientoRegistrado de arriba no interesan aquí.
    await publicador.publicarPendientes();
    rabbit.reiniciar();
  };

  const comando = (
    tipo: 'CerrarConsumos' | 'ReabrirConsumos',
    datos: Record<string, unknown> = {},
    id?: string,
  ) =>
    sobrePrueba(
      tipo,
      { planillaId: PLANILLA_ID, obraId: OBRA_ID, periodo: PERIODO, ...datos },
      id,
    );

  const entregar = (sobre: Record<string, unknown>) =>
    consumidor.procesar(
      mensajePrueba(sobre, `comando.materiales.${String(sobre.tipo)}`),
      canal,
    );

  const cierre = () =>
    prueba.conexion
      .collection('cierre_periodo')
      .findOne({ _id: `${OBRA_ID}:${PERIODO}` as never });

  const cerradoPorMovimiento = async () => {
    const movimientos = await prueba.conexion
      .collection('movimiento')
      .find({})
      .sort({ _id: 1 })
      .toArray();
    return Object.fromEntries(
      movimientos.map((m) => [String(m._id), m.cerrado as boolean]),
    );
  };

  /** Publica el outbox y devuelve lo que salió (clave, tipo, correlacionId y datos). */
  const publicado = async () => {
    await publicador.publicarPendientes();
    return rabbit.publicados.map((p) => ({
      clave: p.clave,
      correlacionId: p.cuerpo.correlacionId,
      datos: p.cuerpo.datos,
    }));
  };

  describe('CerrarConsumos', () => {
    it('cierra el periodo, marca solo sus movimientos y publica ConsumosCerrados con el correlacionId', async () => {
      await registrarMovimientos();
      const sobre = comando('CerrarConsumos');

      await entregar(sobre);

      expect(await cierre()).toMatchObject({
        planilla_id: PLANILLA_ID,
        estado: 'CERRADO',
        cerrado_en: expect.any(Date),
      });
      expect(await cerradoPorMovimiento()).toEqual({
        [MOV.ingreso]: true,
        [MOV.salida]: true,
        [MOV.diciembre]: false,
        [MOV.otraObra]: false,
      });
      expect(await publicado()).toEqual([
        {
          clave: 'evento.materiales.ConsumosCerrados',
          correlacionId: sobre.correlacionId,
          datos: {
            planillaId: PLANILLA_ID,
            obraId: OBRA_ID,
            periodo: PERIODO,
          },
        },
      ]);
      expect(canal.confirmados).toHaveLength(1);
      expect(canal.publicados).toEqual([]);
    });

    it('después del cierre, un movimiento de ese periodo responde 409 PERIODO_CERRADO', async () => {
      await entregar(comando('CerrarConsumos'));

      const respuesta = await registrar().expect(409);
      expect(respuesta.body).toMatchObject({ codigo: 'PERIODO_CERRADO' });
    });

    it('el mismo mensaje dos veces se aplica una sola (inbox)', async () => {
      const sobre = comando('CerrarConsumos');

      await entregar(sobre);
      await entregar(sobre);

      expect(await publicado()).toHaveLength(1);
      expect(
        await prueba.conexion
          .collection('mensaje_procesado')
          .countDocuments({ _id: sobre.id as never }),
      ).toBe(1);
      expect(canal.confirmados).toHaveLength(2);
    });

    it('otro comando de la misma planilla responde igual sin cambiar el cierre', async () => {
      await entregar(comando('CerrarConsumos'));
      const primero = await cierre();

      await entregar(comando('CerrarConsumos'));

      expect(await cierre()).toEqual(primero);
      expect((await publicado()).map((p) => p.clave)).toEqual([
        'evento.materiales.ConsumosCerrados',
        'evento.materiales.ConsumosCerrados',
      ]);
    });

    it('cerrado por otra planilla responde CierreFallido con el periodo real y no cambia nada', async () => {
      await entregar(comando('CerrarConsumos'));
      const primero = await cierre();
      await publicador.publicarPendientes();
      rabbit.reiniciar();
      const sobre = comando('CerrarConsumos', { planillaId: OTRA_PLANILLA_ID });

      await entregar(sobre);

      expect(await cierre()).toEqual(primero);
      expect(await publicado()).toEqual([
        {
          clave: 'evento.materiales.CierreFallido',
          correlacionId: sobre.correlacionId,
          datos: {
            planillaId: OTRA_PLANILLA_ID,
            motivo:
              'Los consumos del periodo 2026-11 ya fueron cerrados por otra planilla',
          },
        },
      ]);
    });

    it('dos planillas a la vez: una cierra y la otra recibe CierreFallido', async () => {
      await Promise.all([
        entregar(comando('CerrarConsumos')),
        entregar(comando('CerrarConsumos', { planillaId: OTRA_PLANILLA_ID })),
      ]);

      const ganadora = (await cierre())?.planilla_id;
      expect([PLANILLA_ID, OTRA_PLANILLA_ID]).toContain(ganadora);
      const salida = await publicado();
      expect(salida.map((p) => p.clave).sort()).toEqual([
        'evento.materiales.CierreFallido',
        'evento.materiales.ConsumosCerrados',
      ]);
      const cerrados = salida.find(
        (p) => p.clave === 'evento.materiales.ConsumosCerrados',
      );
      expect(cerrados?.datos).toMatchObject({ planillaId: ganadora });
    });

    it('si falla al marcar los movimientos no queda nada y se reintenta', async () => {
      await registrarMovimientos();
      const movimientos = prueba.modulo.get<MovimientosPeriodoRepositorio>(
        MOVIMIENTOS_PERIODO_REPOSITORIO,
      );
      vi.spyOn(movimientos, 'marcarCerrados').mockRejectedValueOnce(
        new Error('MongoDB no responde'),
      );
      const sobre = comando('CerrarConsumos');

      await entregar(sobre);

      expect(await cierre()).toBeNull();
      expect(Object.values(await cerradoPorMovimiento())).not.toContain(true);
      expect(await publicado()).toEqual([]);
      expect(
        await prueba.conexion.collection('mensaje_procesado').countDocuments(),
      ).toBe(0);
      expect(canal.publicados).toEqual([
        expect.objectContaining({
          cola: COLA,
          opciones: expect.objectContaining({
            headers: expect.objectContaining({
              'x-intentos': 1,
              'x-clave-origen': 'comando.materiales.CerrarConsumos',
            }),
          }),
        }),
      ]);

      // El reintento llega por el exchange por defecto y esta vez se aplica.
      const reintento = canal.publicados[0];
      await consumidor.procesar(
        mensajePrueba(reintento.cuerpo, COLA, reintento.opciones.headers),
        canal,
      );

      expect(await cierre()).toMatchObject({ estado: 'CERRADO' });
      expect((await cerradoPorMovimiento())[MOV.salida]).toBe(true);
      expect((await publicado()).map((p) => p.clave)).toEqual([
        'evento.materiales.ConsumosCerrados',
      ]);
    });

    it.each([
      ['sin planillaId', { planillaId: undefined }],
      ['sin obraId', { obraId: '' }],
      ['con un periodo que no es AAAA-MM', { periodo: '2026-13' }],
    ])(
      '%s va directo a plataforma.fallidos sin escribir nada',
      async (_caso, datos) => {
        const sobre = comando('CerrarConsumos', datos);

        await entregar(sobre);

        expect(
          await prueba.conexion.collection('cierre_periodo').countDocuments(),
        ).toBe(0);
        expect(
          await prueba.conexion
            .collection('mensaje_procesado')
            .countDocuments(),
        ).toBe(0);
        expect(await publicado()).toEqual([]);
        expect(canal.publicados).toEqual([
          expect.objectContaining({ cola: COLA_FALLIDOS, cuerpo: sobre }),
        ]);
      },
    );
  });

  describe('ReabrirConsumos', () => {
    it('reabre el periodo, desmarca sus movimientos y publica ConsumosReabiertos', async () => {
      await registrarMovimientos();
      await entregar(comando('CerrarConsumos'));
      const cerradoEn = (await cierre())?.cerrado_en;
      await publicador.publicarPendientes();
      rabbit.reiniciar();
      const sobre = comando('ReabrirConsumos');

      await entregar(sobre);

      expect(await cierre()).toMatchObject({
        planilla_id: PLANILLA_ID,
        estado: 'REABIERTO',
        cerrado_en: cerradoEn,
      });
      expect(Object.values(await cerradoPorMovimiento())).not.toContain(true);
      expect(await publicado()).toEqual([
        {
          clave: 'evento.materiales.ConsumosReabiertos',
          correlacionId: sobre.correlacionId,
          datos: {
            planillaId: PLANILLA_ID,
            obraId: OBRA_ID,
            periodo: PERIODO,
          },
        },
      ]);
      // El periodo vuelve a aceptar movimientos.
      await registrar().expect(201);
    });

    it('es idempotente: repetido o sin cierre responde igual sin cambios', async () => {
      await entregar(comando('ReabrirConsumos'));
      expect(await cierre()).toBeNull();

      await entregar(comando('CerrarConsumos'));
      await entregar(comando('ReabrirConsumos'));
      const reabierto = await cierre();
      await entregar(comando('ReabrirConsumos'));

      expect(await cierre()).toEqual(reabierto);
      expect((await publicado()).map((p) => p.clave)).toEqual([
        'evento.materiales.ConsumosReabiertos',
        'evento.materiales.ConsumosCerrados',
        'evento.materiales.ConsumosReabiertos',
        'evento.materiales.ConsumosReabiertos',
      ]);
    });

    it('no reabre el cierre de otra planilla ni publica nada', async () => {
      await registrarMovimientos();
      await entregar(comando('CerrarConsumos'));
      const primero = await cierre();
      await publicador.publicarPendientes();
      rabbit.reiniciar();

      await entregar(
        comando('ReabrirConsumos', { planillaId: OTRA_PLANILLA_ID }),
      );

      expect(await cierre()).toEqual(primero);
      expect((await cerradoPorMovimiento())[MOV.salida]).toBe(true);
      expect(await publicado()).toEqual([]);
      expect(canal.confirmados).toHaveLength(2);
    });

    it('un periodo reabierto lo puede cerrar otra planilla', async () => {
      await entregar(comando('CerrarConsumos'));
      await entregar(comando('ReabrirConsumos'));

      await entregar(
        comando('CerrarConsumos', { planillaId: OTRA_PLANILLA_ID }),
      );

      expect(await cierre()).toMatchObject({
        planilla_id: OTRA_PLANILLA_ID,
        estado: 'CERRADO',
      });
    });
  });
});
