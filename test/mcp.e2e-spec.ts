import { createHash } from 'node:crypto';
import { type INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { AccesoObraModule } from '../src/acceso-obra/acceso-obra.module.js';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import { CierresModule } from '../src/cierres/cierres.module.js';
import { McpModule } from '../src/mcp/mcp.module.js';
import { MovimientosModule } from '../src/movimientos/movimientos.module.js';
import { CargarSemilla } from '../src/semilla/cargar-semilla.js';
import { SemillaModule } from '../src/semilla/semilla.module.js';
import { StockModule } from '../src/stock/stock.module.js';
import { crearAppPrueba, type AppPrueba } from './utilidades/app-prueba.js';
import { RabbitPrueba } from './utilidades/canal-prueba.js';

/** Versión común del protocolo en la plataforma (501, diseño). */
const VERSION_MCP = '2025-11-25';
/** Fecha de carga de la semilla (011), la misma de `semilla.e2e-spec.ts`. */
const D = '2026-10-28';
const obra = (o: number) => `b0000000-0000-4000-8000-00000000000${o}`;
const OBRA_INEXISTENTE = 'b0000000-0000-4000-8000-000000000099';

interface ResultadoHerramienta {
  isError?: boolean;
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
}

describe('Servidor MCP /mcp (e2e)', () => {
  let prueba: AppPrueba;
  let semilla: INestApplicationContext;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    prueba = await crearAppPrueba(
      [
        AccesoObraModule,
        CatalogoModule,
        StockModule,
        CierresModule,
        MovimientosModule,
        McpModule,
      ],
      new RabbitPrueba(),
    );
    tokens.agente = await prueba.claves.firmarConRoles(
      ['agente_ia'],
      'ia-agentes',
    );
    tokens.gerente = await prueba.claves.firmarConRoles(['gerente']);
    tokens.admin = await prueba.claves.firmarConRoles(['admin']);
    // agente_ia en un token de persona (azp erp) no cuenta: solo los roles internos.
    tokens.agenteDesdeErp = await prueba.claves.firmarConRoles(
      ['agente_ia'],
      'erp',
    );
    // Datos de prueba (011): las cifras se comparan con las del REST.
    semilla = await NestFactory.createApplicationContext(
      SemillaModule.registrar({
        MONGODB_URI: prueba.uri,
        NODE_ENV: 'development',
      }),
      { logger: false, abortOnError: false },
    );
    await semilla.get(CargarSemilla).ejecutar(D);
  }, 300_000);

  afterAll(async () => {
    await semilla?.close();
    await prueba?.cerrar();
  });

  const servidor = () => prueba.app.getHttpServer();
  let siguienteId = 1;
  const rpc = (
    method: string,
    params: Record<string, unknown> = {},
    token: string | null = tokens.agente,
  ) => {
    const peticion = request(servidor())
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('MCP-Protocol-Version', VERSION_MCP)
      .set('X-Request-Id', 'ejecucion-prueba-1');
    if (token) peticion.set('Authorization', 'Bearer ' + token);
    return peticion.send({ jsonrpc: '2.0', id: siguienteId++, method, params });
  };
  /** `tools/call` con el token de agente_ia: devuelve el resultado de la herramienta. */
  const llamar = async (
    nombre: string,
    argumentos: unknown = {},
  ): Promise<ResultadoHerramienta> => {
    const respuesta = await rpc('tools/call', {
      name: nombre,
      arguments: argumentos,
    });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.error).toBeUndefined();
    return respuesta.body.result as ResultadoHerramienta;
  };
  /** Salida de una llamada correcta; comprueba que el texto es el mismo JSON. */
  const salidaDe = async (nombre: string, argumentos: unknown = {}) => {
    const resultado = await llamar(nombre, argumentos);
    expect(resultado.isError).toBeFalsy();
    expect(JSON.parse(resultado.content[0].text)).toEqual(
      resultado.structuredContent,
    );
    return resultado.structuredContent as Record<string, any>;
  };
  const getRest = (ruta: string) =>
    request(servidor())
      .get(ruta)
      .set('Authorization', 'Bearer ' + tokens.gerente);
  const inicializar = (token: string | null = tokens.agente) =>
    rpc(
      'initialize',
      {
        protocolVersion: VERSION_MCP,
        capabilities: {},
        clientInfo: { name: 'prueba', version: '1.0.0' },
      },
      token,
    );

  describe('acceso', () => {
    it('sin token responde 401', async () => {
      const respuesta = await inicializar(null);
      expect(respuesta.status).toBe(401);
      expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
    });

    it('con un token inválido responde 401', async () => {
      const respuesta = await inicializar('no-es-un-token');
      expect(respuesta.status).toBe(401);
    });

    it.each(['gerente', 'admin', 'agenteDesdeErp'])(
      'con token de %s responde 403',
      async (quien) => {
        const respuesta = await inicializar(tokens[quien]);
        expect(respuesta.status).toBe(403);
        expect(respuesta.body.codigo).toBe('SIN_PERMISO');
      },
    );

    it('con token de agente_ia responde 200 en JSON, sin sesión', async () => {
      const respuesta = await inicializar();
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['content-type']).toContain('application/json');
      expect(respuesta.headers['mcp-session-id']).toBeUndefined();
      expect(respuesta.headers['x-request-id']).toBe('ejecucion-prueba-1');
      expect(respuesta.body.result.protocolVersion).toBe(VERSION_MCP);
      expect(respuesta.body.result.serverInfo.name).toBe('materiales');
      // Solo herramientas: ni recursos ni prompts (501, criterio 3).
      expect(Object.keys(respuesta.body.result.capabilities)).toEqual([
        'tools',
      ]);
    });

    it('la notificación initialized responde 202', async () => {
      const respuesta = await request(servidor())
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .set('Authorization', 'Bearer ' + tokens.agente)
        .set('MCP-Protocol-Version', VERSION_MCP)
        .send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      expect(respuesta.status).toBe(202);
    });

    it.each(['get', 'delete'] as const)(
      '%s /mcp responde 405 (sin estado)',
      async (metodo) => {
        const respuesta = await request(servidor())
          [metodo]('/mcp')
          .set('Authorization', 'Bearer ' + tokens.agente);
        expect(respuesta.status).toBe(405);
        expect(respuesta.headers.allow).toBe('POST');
      },
    );

    it('get /mcp sin token responde 401', async () => {
      const respuesta = await request(servidor()).get('/mcp');
      expect(respuesta.status).toBe(401);
    });
  });

  describe('stock_obra', () => {
    it('sin obraId: las 14 filas de la semilla, BAJO → JUSTO → OK, con las cifras del REST', async () => {
      const salida = await salidaDe('stock_obra');
      expect(salida.total).toBe(14);
      expect(salida.truncado).toBe(false);
      expect(salida.filas).toHaveLength(14);
      const orden = { BAJO: 0, JUSTO: 1, OK: 2 } as Record<string, number>;
      const rangos = salida.filas.map((f: any) => orden[f.estado]);
      expect(rangos).toEqual([...rangos].sort((a, b) => a - b));
      expect(salida.filas[0]).toMatchObject({
        obraId: obra(2),
        codigo: 'CEM-IP30',
        cantidad: 25,
        estado: 'BAJO',
      });
      // Mismas cifras que GET /obras/{obraId}/stock (003) para cada obra.
      for (const o of [1, 2, 3]) {
        const rest = await getRest(`/obras/${obra(o)}/stock`);
        expect(rest.status).toBe(200);
        const nombre = (
          await prueba.conexion
            .collection('obra_acceso')
            .findOne({ _id: obra(o) as never })
        )?.nombre;
        const delMcp = salida.filas
          .filter((f: any) => f.obraId === obra(o))
          .map(({ obraId: _o, obraNombre, ...resto }: any) => {
            expect(obraNombre).toBe(nombre);
            return resto;
          })
          .sort((a: any, b: any) => (a.codigo < b.codigo ? -1 : 1));
        expect(delMcp).toEqual(
          rest.body.map(({ unidadPlural: _u, ...resto }: any) => resto),
        );
      }
    });

    it('filtra por estados y por obra', async () => {
      const bajos = await salidaDe('stock_obra', { estados: ['BAJO'] });
      expect(bajos.filas.map((f: any) => [f.obraId, f.codigo])).toEqual([
        [obra(2), 'CEM-IP30'],
      ]);
      const deLaUno = await salidaDe('stock_obra', {
        obraId: obra(1),
        estados: ['JUSTO', 'OK'],
      });
      expect(deLaUno.total).toBe(7);
      expect(deLaUno.filas[0]).toMatchObject({
        codigo: 'FIE-12',
        estado: 'JUSTO',
      });
    });

    it('con limite recorta y avisa truncado; total cuenta todas', async () => {
      const salida = await salidaDe('stock_obra', { limite: 2 });
      expect(salida.filas).toHaveLength(2);
      expect(salida).toMatchObject({ total: 14, truncado: true });
    });
  });

  describe('consumos_partida', () => {
    it('usado igual a GET /obras/{obraId}/consumos, con salidas contadas en la colección', async () => {
      for (const [o, periodo] of [
        [1, '2026-09'],
        [1, '2026-08'],
        [2, '2026-09'],
      ] as const) {
        const salida = await salidaDe('consumos_partida', {
          obraId: obra(o),
          periodo,
        });
        const rest = await getRest(
          `/obras/${obra(o)}/consumos?periodo=${periodo}`,
        );
        expect(rest.status).toBe(200);
        expect(rest.body.length).toBeGreaterThan(0);
        expect(
          salida.filas.map((f: any) => ({
            partidaId: f.partidaId,
            materialId: f.materialId,
            cantidad: f.usado,
          })),
        ).toEqual(rest.body);
        for (const fila of salida.filas) {
          const filtro = {
            obra_id: obra(o),
            periodo,
            tipo: 'SALIDA',
            partida_id: fila.partidaId,
            material_id: fila.materialId,
          };
          const movimientos = prueba.conexion.collection('movimiento');
          expect(fila.salidas).toBe(await movimientos.countDocuments(filtro));
          expect(fila.salidasSuperanStock).toBe(
            await movimientos.countDocuments({ ...filtro, supera_stock: true }),
          );
        }
        expect(salida).toMatchObject({
          obraId: obra(o),
          periodo,
          truncado: false,
        });
      }
    });

    it('cuenta la salida que superó el stock y filtra por partida', async () => {
      const superada = await prueba.conexion
        .collection('movimiento')
        .findOne({ supera_stock: true });
      const salida = await salidaDe('consumos_partida', {
        obraId: superada!.obra_id,
        periodo: superada!.periodo,
        partidaId: superada!.partida_id,
      });
      expect(new Set(salida.filas.map((f: any) => f.partidaId))).toEqual(
        new Set([superada!.partida_id]),
      );
      const fila = salida.filas.find(
        (f: any) => f.materialId === superada!.material_id,
      );
      expect(fila).toMatchObject({
        codigo: 'CEM-IP30',
        salidasSuperanStock: 1,
      });
    });

    it('cerrado según cierre_periodo', async () => {
      const cerrado = await salidaDe('consumos_partida', {
        obraId: obra(1),
        periodo: '2026-08',
      });
      expect(cerrado.cerrado).toBe(true);
      const abierto = await salidaDe('consumos_partida', {
        obraId: obra(1),
        periodo: '2026-09',
      });
      expect(abierto.cerrado).toBe(false);
    });

    it('periodo sin salidas: filas vacías', async () => {
      const salida = await salidaDe('consumos_partida', {
        obraId: obra(3),
        periodo: '2020-01',
      });
      expect(salida).toEqual({
        obraId: obra(3),
        periodo: '2020-01',
        cerrado: false,
        filas: [],
        truncado: false,
      });
    });

    it('más de 200 grupos: devuelve 200 y truncado', async () => {
      const movimientos = prueba.conexion.collection('movimiento');
      const material = await prueba.conexion.collection('material').findOne();
      const periodo = '2030-01';
      await movimientos.insertMany(
        Array.from({ length: 201 }, (_, i) => ({
          _id: crypto.randomUUID() as never,
          obra_id: obra(3),
          material_id: material!._id,
          tipo: 'SALIDA',
          cantidad: Types.Decimal128.fromString('1'),
          partida_id: `c0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          orden_compra_id: null,
          periodo,
          cerrado: false,
          supera_stock: false,
          registrado_por: 'almacenero-prueba',
          registrado_en: new Date('2030-01-15T12:00:00Z'),
          nota_remision: null,
        })),
      );
      try {
        const salida = await salidaDe('consumos_partida', {
          obraId: obra(3),
          periodo,
        });
        expect(salida.filas).toHaveLength(200);
        expect(salida.truncado).toBe(true);
      } finally {
        await movimientos.deleteMany({ obra_id: obra(3), periodo });
      }
    });
  });

  describe('tools/list', () => {
    it('publica exactamente consumos_partida y stock_obra, con esquemas estrictos y solo lectura', async () => {
      const respuesta = await rpc('tools/list');
      expect(respuesta.status).toBe(200);
      const herramientas = respuesta.body.result.tools as Record<string, any>[];
      expect(herramientas.map((h) => h.name).sort()).toEqual([
        'consumos_partida',
        'stock_obra',
      ]);
      for (const h of herramientas) {
        expect(h.description).toMatch(/^Devuelve /);
        expect(h.annotations).toEqual({
          readOnlyHint: true,
          openWorldHint: false,
        });
        expect(h.inputSchema).toMatchObject({
          type: 'object',
          additionalProperties: false,
        });
        expect(h.outputSchema).toMatchObject({
          type: 'object',
          additionalProperties: false,
        });
      }
      const porNombre = Object.fromEntries(
        herramientas.map((h) => [h.name, h]),
      );

      const stock = porNombre.stock_obra;
      expect(Object.keys(stock.inputSchema.properties).sort()).toEqual([
        'estados',
        'limite',
        'obraId',
      ]);
      expect(stock.inputSchema.required ?? []).toEqual([]);
      expect(stock.inputSchema.properties.obraId.format).toBe('uuid');
      expect(stock.inputSchema.properties.limite).toMatchObject({
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 100,
      });
      expect(stock.inputSchema.properties.estados.items.enum).toEqual([
        'BAJO',
        'JUSTO',
        'OK',
      ]);
      expect(Object.keys(stock.outputSchema.properties).sort()).toEqual([
        'filas',
        'total',
        'truncado',
      ]);
      expect(
        Object.keys(
          stock.outputSchema.properties.filas.items.properties,
        ).sort(),
      ).toEqual(
        [
          'obraId',
          'obraNombre',
          'materialId',
          'codigo',
          'nombre',
          'unidad',
          'cantidad',
          'minimo',
          'estado',
        ].sort(),
      );

      const consumos = porNombre.consumos_partida;
      expect([...consumos.inputSchema.required].sort()).toEqual([
        'obraId',
        'periodo',
      ]);
      expect(Object.keys(consumos.inputSchema.properties).sort()).toEqual([
        'obraId',
        'partidaId',
        'periodo',
      ]);
      expect(consumos.inputSchema.properties.periodo.pattern).toBeDefined();
      expect(Object.keys(consumos.outputSchema.properties).sort()).toEqual([
        'cerrado',
        'filas',
        'obraId',
        'periodo',
        'truncado',
      ]);
      expect(
        Object.keys(
          consumos.outputSchema.properties.filas.items.properties,
        ).sort(),
      ).toEqual(
        [
          'partidaId',
          'materialId',
          'codigo',
          'nombre',
          'unidad',
          'usado',
          'salidas',
          'salidasSuperanStock',
        ].sort(),
      );
    });

    it('no publica recursos ni prompts', async () => {
      for (const metodo of ['resources/list', 'prompts/list']) {
        const respuesta = await rpc(metodo);
        expect(respuesta.body.error?.code).toBe(-32601);
      }
    });

    it('una herramienta que no existe es un error del protocolo', async () => {
      const respuesta = await rpc('tools/call', {
        name: 'asistencia_obra',
        arguments: {},
      });
      expect(respuesta.body.result).toBeUndefined();
      expect(respuesta.body.error).toBeDefined();
    });
  });

  describe('errores de herramienta', () => {
    afterEach(() => {
      mongoose.set('debug', false);
    });

    /**
     * Anota las consultas a MongoDB. Se ignora `outbox_evento`: el `OutboxPublicador` la lee cada
     * 1 s en segundo plano, sin relación con la herramienta.
     */
    const anotarConsultas = (consultas: string[]) =>
      mongoose.set('debug', (coleccion: string, metodo: string) => {
        if (coleccion !== 'outbox_evento') {
          consultas.push(`${coleccion}.${metodo}`);
        }
      });

    const errorDe = (resultado: ResultadoHerramienta) => {
      expect(resultado.isError).toBe(true);
      expect(resultado.structuredContent).toBeUndefined();
      return JSON.parse(resultado.content[0].text) as {
        codigo: string;
        mensaje: string;
      };
    };

    it.each([
      ['stock_obra', { obraId: 'no-es-uuid' }],
      ['stock_obra', { obraId: "x' OR 1=1" }],
      ['stock_obra', { obraId: { $ne: null } }],
      ['stock_obra', { limite: 1000 }],
      ['stock_obra', { limite: 0 }],
      ['stock_obra', { limite: 1.5 }],
      ['stock_obra', { estados: ['CRITICO'] }],
      ['stock_obra', { campoDeMas: true }],
      ['consumos_partida', { obraId: obra(1), periodo: '2027-13' }],
      ['consumos_partida', { obraId: obra(1) }],
      ['consumos_partida', { periodo: '2026-09' }],
      ['consumos_partida', { obraId: "x' OR 1=1", periodo: '2026-09' }],
      [
        'consumos_partida',
        { obraId: obra(1), periodo: '2026-09', partidaId: 'p-1' },
      ],
      [
        'consumos_partida',
        { obraId: obra(1), periodo: '2026-09', limite: 1000 },
      ],
    ])(
      '%s %j: ARGUMENTO_INVALIDO sin consultar la base',
      async (nombre, argumentos) => {
        const consultas: string[] = [];
        anotarConsultas(consultas);
        const error = errorDe(await llamar(nombre, argumentos));
        expect(error.codigo).toBe('ARGUMENTO_INVALIDO');
        expect(error.mensaje.length).toBeGreaterThan(0);
        expect(consultas).toEqual([]);
      },
    );

    it('el registro de consultas sí ve una llamada válida (control de la prueba anterior)', async () => {
      const consultas: string[] = [];
      anotarConsultas(consultas);
      await salidaDe('stock_obra', { obraId: obra(1) });
      expect(consultas).toContain('stock_obra.find');
    });

    it.each([
      ['stock_obra', { obraId: OBRA_INEXISTENTE }],
      ['consumos_partida', { obraId: OBRA_INEXISTENTE, periodo: '2026-09' }],
    ])(
      '%s con una obra inexistente: OBRA_NO_ENCONTRADA',
      async (nombre, argumentos) => {
        expect(errorDe(await llamar(nombre, argumentos))).toEqual({
          codigo: 'OBRA_NO_ENCONTRADA',
          mensaje: 'La obra pedida no existe.',
        });
      },
    );
  });

  it('registra cada llamada en una línea JSON con el X-Request-Id y sin el token', async () => {
    const lineas: string[] = [];
    const espia = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((mensaje: unknown) => {
        lineas.push(String(mensaje));
      });
    try {
      await salidaDe('stock_obra', { estados: ['BAJO'] });
    } finally {
      espia.mockRestore();
    }
    const registro = lineas
      .filter((linea) => linea.startsWith('{'))
      .map((linea) => JSON.parse(linea) as Record<string, unknown>);
    expect(registro).toHaveLength(1);
    expect(registro[0]).toMatchObject({
      herramienta: 'stock_obra',
      argumentos: { estados: ['BAJO'] },
      filas: 1,
      requestId: 'ejecucion-prueba-1',
    });
    expect(typeof registro[0].duracionMs).toBe('number');
    expect(lineas.join('\n')).not.toContain(tokens.agente);
  });

  it('solo lectura: después de llamar todas las herramientas ninguna colección cambió', async () => {
    /** Conteo y suma de verificación de cada colección de la base. */
    const fotografiar = async () => {
      const foto: Record<string, { conteo: number; suma: string }> = {};
      const colecciones = await prueba.conexion.db!.listCollections().toArray();
      for (const { name } of colecciones) {
        const documentos = await prueba.conexion
          .collection(name)
          .find({})
          .sort({ _id: 1 })
          .toArray();
        foto[name] = {
          conteo: documentos.length,
          suma: createHash('sha256')
            .update(JSON.stringify(documentos))
            .digest('hex'),
        };
      }
      return foto;
    };
    const antes = await fotografiar();
    expect(antes.movimiento.conteo).toBe(67);
    expect(antes.stock_obra.conteo).toBe(14);
    await llamar('stock_obra', {});
    await llamar('stock_obra', { obraId: obra(2), estados: ['BAJO'] });
    for (const periodo of ['2026-07', '2026-08', '2026-09', '2026-10']) {
      for (const o of [1, 2, 3]) {
        await llamar('consumos_partida', { obraId: obra(o), periodo });
      }
    }
    await llamar('consumos_partida', {
      obraId: OBRA_INEXISTENTE,
      periodo: '2026-09',
    });
    await llamar('stock_obra', { limite: 1000 });
    expect(await fotografiar()).toEqual(antes);
  });
});
