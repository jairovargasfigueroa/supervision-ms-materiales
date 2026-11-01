import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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
      expect(deLaUno.filas[0]).toMatchObject({ codigo: 'FIE-12', estado: 'JUSTO' });
    });

    it('con limite recorta y avisa truncado; total cuenta todas', async () => {
      const salida = await salidaDe('stock_obra', { limite: 2 });
      expect(salida.filas).toHaveLength(2);
      expect(salida).toMatchObject({ total: 14, truncado: true });
    });
  });
});
