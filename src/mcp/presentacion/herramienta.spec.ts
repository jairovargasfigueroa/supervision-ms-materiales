import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/server';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { Material } from '../../catalogo/dominio/material.js';
import { ReglaNegocioError } from '../../compartido/dominio/regla-negocio.error.js';
import type {
  ConsultarConsumosPartidaCasoUso,
  FilaConsumoPartida,
} from '../../movimientos/aplicacion/casos-uso/consultar-consumos-partida.caso-uso.js';
import {
  type ContextoMcp,
  type HerramientaMcp,
  registrarHerramienta,
} from './herramienta.js';
import { ConsumosPartidaHerramienta } from './herramientas/consumos-partida.herramienta.js';
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

/** Una petición JSON-RPC por el transporte sin estado, como lo haría `/mcp`. */
async function rpc(
  servidor: McpServer,
  method: string,
  params: Record<string, unknown> = {},
) {
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
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );
  return (await respuesta.json()) as { result: any; error?: unknown };
}

/** Llama a la herramienta (`prueba` si no se dice otra). */
async function llamar(
  servidor: McpServer,
  argumentos: unknown,
  nombre = 'prueba',
) {
  const cuerpo = await rpc(servidor, 'tools/call', {
    name: nombre,
    arguments: argumentos,
  });
  expect(cuerpo.error).toBeUndefined();
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

describe('consumos_partida con obraId opcional (505)', () => {
  const OBRA = 'b0000000-0000-4000-8000-000000000001';
  const PARTIDA = 'c0000000-0000-4000-8000-000000000001';
  const cemento = new Material('cem', {
    codigo: 'CEM-IP30',
    nombre: 'Cemento IP-30',
    tipo: 'CEMENTO',
    unidad: 'bolsa',
    unidadPlural: 'bolsas',
    precioReferencial: 62,
    activo: true,
    atributos: [],
  });
  const fila: FilaConsumoPartida = {
    resumen: {
      obraId: OBRA,
      partidaId: PARTIDA,
      materialId: 'cem',
      cantidad: 14.5,
      salidas: 2,
      salidasSuperanStock: 1,
    },
    material: cemento,
    obraNombre: 'Edificio Las Palmas',
  };
  const filaSalida = {
    obraId: OBRA,
    obraNombre: 'Edificio Las Palmas',
    partidaId: PARTIDA,
    materialId: 'cem',
    codigo: 'CEM-IP30',
    nombre: 'Cemento IP-30',
    unidad: 'bolsa',
    usado: 14.5,
    salidas: 2,
    salidasSuperanStock: 1,
  };

  let ejecutar: ReturnType<typeof vi.fn>;
  let servidor: McpServer;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    ejecutar = vi.fn();
    const caso = { ejecutar } as unknown as ConsultarConsumosPartidaCasoUso;
    servidor = crearServidorMcp(
      [new ConsumosPartidaHerramienta(caso) as HerramientaMcp],
      contexto,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tools/list: solo periodo es obligatorio; obraId y cerrado pueden ser null en la salida', async () => {
    const { result } = await rpc(servidor, 'tools/list');
    const [consumos] = result.tools as Record<string, any>[];
    expect(consumos.name).toBe('consumos_partida');
    expect(consumos.inputSchema.required).toEqual(['periodo']);
    expect(Object.keys(consumos.inputSchema.properties).sort()).toEqual([
      'obraId',
      'partidaId',
      'periodo',
    ]);
    expect(
      Object.keys(consumos.outputSchema.properties.filas.items.properties),
    ).toEqual(Object.keys(filaSalida));
    expect(JSON.stringify(consumos.outputSchema.properties.obraId)).toContain(
      '"null"',
    );
    expect(JSON.stringify(consumos.outputSchema.properties.cerrado)).toContain(
      '"null"',
    );
  });

  it('sin obraId: pide el lote (500 filas) y responde obraId y cerrado en null', async () => {
    ejecutar.mockResolvedValue({
      cerrado: null,
      filas: [fila],
      truncado: true,
    });
    const resultado = await llamar(
      servidor,
      { periodo: '2026-09' },
      'consumos_partida',
    );
    expect(ejecutar).toHaveBeenCalledWith(
      { periodo: '2026-09', limite: 500 },
      contexto.usuario,
    );
    expect(resultado.isError).toBeFalsy();
    expect(resultado.structuredContent).toEqual({
      obraId: null,
      periodo: '2026-09',
      cerrado: null,
      filas: [filaSalida],
      truncado: true,
    });
  });

  it('con obraId: como en la 501 (200 filas, cerrado) y las filas con obraId y obraNombre', async () => {
    ejecutar.mockResolvedValue({
      cerrado: true,
      filas: [fila],
      truncado: false,
    });
    const resultado = await llamar(
      servidor,
      { obraId: OBRA, periodo: '2026-08', partidaId: PARTIDA },
      'consumos_partida',
    );
    expect(ejecutar).toHaveBeenCalledWith(
      { obraId: OBRA, periodo: '2026-08', partidaId: PARTIDA, limite: 200 },
      contexto.usuario,
    );
    expect(resultado.structuredContent).toEqual({
      obraId: OBRA,
      periodo: '2026-08',
      cerrado: true,
      filas: [filaSalida],
      truncado: false,
    });
  });

  it.each([
    ['sin periodo', {}],
    ['obraId null', { obraId: null, periodo: '2026-09' }],
  ])('%s: ARGUMENTO_INVALIDO sin consultar', async (_caso, argumentos) => {
    const resultado = await llamar(servidor, argumentos, 'consumos_partida');
    expect(error(resultado).codigo).toBe('ARGUMENTO_INVALIDO');
    expect(ejecutar).not.toHaveBeenCalled();
  });
});
