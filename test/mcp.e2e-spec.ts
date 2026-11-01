import request from 'supertest';
import { AccesoObraModule } from '../src/acceso-obra/acceso-obra.module.js';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import { CierresModule } from '../src/cierres/cierres.module.js';
import { McpModule } from '../src/mcp/mcp.module.js';
import { MovimientosModule } from '../src/movimientos/movimientos.module.js';
import { StockModule } from '../src/stock/stock.module.js';
import { crearAppPrueba, type AppPrueba } from './utilidades/app-prueba.js';
import { RabbitPrueba } from './utilidades/canal-prueba.js';

/** Versión común del protocolo en la plataforma (501, diseño). */
const VERSION_MCP = '2025-11-25';

describe('Servidor MCP /mcp (e2e)', () => {
  let prueba: AppPrueba;
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
  }, 300_000);

  afterAll(async () => {
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
});
