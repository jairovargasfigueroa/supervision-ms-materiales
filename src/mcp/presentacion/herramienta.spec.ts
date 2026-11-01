import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/server';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { ReglaNegocioError } from '../../compartido/dominio/regla-negocio.error.js';
import {
  type ContextoMcp,
  type HerramientaMcp,
  registrarHerramienta,
} from './herramienta.js';
import { crearServidorMcp } from './servidor-mcp.js';

const contexto: ContextoMcp = {
  usuario: { id: 'sa', roles: ['agente_ia'], azp: 'ia-agentes' },
  requestId: 'ejecucion-7',
};

const entrada = z.strictObject({ n: z.int().min(1).max(10) });
const salida = z.strictObject({
  filas: z.array(z.int()),
  truncado: z.boolean(),
});

/** Herramienta de prueba: devuelve `n` filas o lo que diga `comportamiento`. */
function herramienta(
  comportamiento: (n: number) => Promise<z.output<typeof salida>>,
): HerramientaMcp<typeof entrada, typeof salida> & { llamadas: number } {
  return {
    nombre: 'prueba',
    descripcion: 'Devuelve filas de prueba.',
    entrada,
    salida,
    llamadas: 0,
    ejecutar(argumentos) {
      this.llamadas++;
      return comportamiento(argumentos.n);
    },
    filas: (s) => s.filas.length,
  };
}

/** Llama a la herramienta por el transporte sin estado, como lo haría `/mcp`. */
async function llamar(servidor: McpServer, argumentos: unknown) {
  const transporte = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await servidor.connect(transporte);
  const respuesta = await transporte.handleRequest(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-11-25',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'prueba', arguments: argumentos },
      }),
    }),
  );
  const cuerpo = (await respuesta.json()) as { result: any };
  return cuerpo.result as {
    isError?: boolean;
    content: { text: string }[];
    structuredContent?: unknown;
  };
}

const error = (resultado: { content: { text: string }[] }) =>
  JSON.parse(resultado.content[0].text) as { codigo: string; mensaje: string };

describe('registrarHerramienta (501)', () => {
  let registros: string[];

  beforeEach(() => {
    registros = [];
    vi.spyOn(Logger.prototype, 'log').mockImplementation((mensaje: unknown) => {
      registros.push(String(mensaje));
    });
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resultado correcto: structuredContent y el mismo JSON como texto; una línea de registro', async () => {
    const h = herramienta((n) =>
      Promise.resolve({
        filas: Array.from({ length: n }, (_, i) => i),
        truncado: false,
      }),
    );
    const resultado = await llamar(crearServidorMcp([h], contexto), { n: 3 });
    expect(resultado.isError).toBeFalsy();
    expect(resultado.structuredContent).toEqual({
      filas: [0, 1, 2],
      truncado: false,
    });
    expect(JSON.parse(resultado.content[0].text)).toEqual(
      resultado.structuredContent,
    );
    expect(registros).toHaveLength(1);
    const linea = JSON.parse(registros[0]) as Record<string, unknown>;
    expect(linea).toMatchObject({
      herramienta: 'prueba',
      argumentos: { n: 3 },
      filas: 3,
      requestId: 'ejecucion-7',
    });
    expect(typeof linea.duracionMs).toBe('number');
    expect(linea.codigo).toBeUndefined();
  });

  it.each([
    ['fuera de rango', { n: 1000 }],
    ['tipo distinto', { n: "x' OR 1=1" }],
    ['campo de más', { n: 1, extra: true }],
    ['sin argumentos', undefined],
  ])(
    'argumentos inválidos (%s): ARGUMENTO_INVALIDO sin ejecutar',
    async (_caso, argumentos) => {
      const h = herramienta(() =>
        Promise.resolve({ filas: [], truncado: false }),
      );
      const resultado = await llamar(
        crearServidorMcp([h], contexto),
        argumentos,
      );
      expect(resultado.isError).toBe(true);
      expect(error(resultado).codigo).toBe('ARGUMENTO_INVALIDO');
      expect(error(resultado).mensaje).not.toBe('');
      expect(h.llamadas).toBe(0);
      expect(JSON.parse(registros[0])).toMatchObject({
        codigo: 'ARGUMENTO_INVALIDO',
        filas: 0,
      });
    },
  );

  it('la obra que no está en obra_acceso: OBRA_NO_ENCONTRADA', async () => {
    const h = herramienta(() =>
      Promise.reject(
        new ReglaNegocioError('OBRA_NO_ENCONTRADA', 'Obra no encontrada', 404),
      ),
    );
    const resultado = await llamar(crearServidorMcp([h], contexto), { n: 1 });
    expect(resultado.isError).toBe(true);
    expect(error(resultado)).toEqual({
      codigo: 'OBRA_NO_ENCONTRADA',
      mensaje: 'La obra pedida no existe.',
    });
  });

  it('otro fallo: ERROR_INTERNO sin mostrar el detalle', async () => {
    const h = herramienta(() =>
      Promise.reject(new Error('MongoServerError: secreto')),
    );
    const resultado = await llamar(crearServidorMcp([h], contexto), { n: 1 });
    expect(error(resultado)).toEqual({
      codigo: 'ERROR_INTERNO',
      mensaje: 'La consulta falló en el servicio.',
    });
    expect(resultado.content[0].text).not.toContain('secreto');
  });

  it('una consulta que pasa del tiempo máximo: ERROR_INTERNO', async () => {
    const servidor = new McpServer(
      { name: 'materiales', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
    const h = herramienta(() => new Promise(() => undefined));
    registrarHerramienta(servidor, h, contexto, 20);
    const resultado = await llamar(servidor, { n: 1 });
    expect(error(resultado).codigo).toBe('ERROR_INTERNO');
  });
});
