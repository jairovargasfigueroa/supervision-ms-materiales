import type {
  CallToolResult,
  McpServer,
  StandardSchemaWithJSON,
} from '@modelcontextprotocol/server';
import { Logger } from '@nestjs/common';
import type { z } from 'zod';
import { ReglaNegocioError } from '../../compartido/dominio/regla-negocio.error.js';
import type { UsuarioAutenticado } from '../../compartido/infraestructura/auth/usuario-autenticado.js';

/** Quién llama y con qué `X-Request-Id` (el id de la ejecución del agente, 502). */
export interface ContextoMcp {
  usuario: UsuarioAutenticado;
  requestId: string;
}

/**
 * Una herramienta MCP de solo lectura (501): esquemas `zod` de entrada y salida (de ellos salen
 * el `inputSchema` y el `outputSchema` de `tools/list`) y una ejecución que solo llama a casos de
 * uso de consulta.
 */
export interface HerramientaMcp<
  E extends z.ZodType = z.ZodType,
  S extends z.ZodType = z.ZodType,
> {
  readonly nombre: string;
  /** En español, empieza con «Devuelve…»; la lee el modelo de lenguaje. */
  readonly descripcion: string;
  readonly entrada: E;
  readonly salida: S;
  ejecutar(
    argumentos: z.output<E>,
    contexto: ContextoMcp,
  ): Promise<z.output<S>>;
  /** Filas devueltas, para el registro de la llamada. */
  filas(salida: z.output<S>): number;
}

/** Códigos de error de herramienta (501, diseño, «Errores como resultado»). */
export type CodigoErrorHerramienta =
  'ARGUMENTO_INVALIDO' | 'OBRA_NO_ENCONTRADA' | 'ERROR_INTERNO';

/** Las anotaciones con que se anuncia cada herramienta. */
export const ANOTACIONES_SOLO_LECTURA = {
  readOnlyHint: true,
  openWorldHint: false,
} as const;

/** Tiempo máximo de consulta de una herramienta (501, diseño, «Respuestas compactas»). */
export const TIEMPO_MAXIMO_MS = 5000;

/** Mensajes para el modelo de cada error (`docs/mensajes.md`, pasos de la ejecución). */
const MENSAJE_OBRA_NO_ENCONTRADA = 'La obra pedida no existe.';
const MENSAJE_ERROR_INTERNO = 'La consulta falló en el servicio.';

const registro = new Logger('MCP');

/** La consulta pasó del tiempo máximo. */
class TiempoAgotadoError extends Error {
  constructor(ms: number) {
    super(`La consulta pasó de ${ms} ms.`);
    this.name = 'TiempoAgotadoError';
  }
}

/**
 * Registra la herramienta en el servidor. El SDK no valida los argumentos (recibe un esquema que
 * solo aporta el JSON Schema): si validara, respondería con su propio texto. Aquí se validan con
 * el esquema estricto y, si no cumplen, el resultado es `ARGUMENTO_INVALIDO` sin llamar al caso
 * de uso (no se consulta la base).
 *
 * Los errores de negocio son resultados (`isError: true`): la obra que no está en `obra_acceso`
 * es `OBRA_NO_ENCONTRADA`; cualquier otro fallo o una consulta de más de 5 s, `ERROR_INTERNO`
 * (el detalle queda solo en el log). Cada llamada deja una línea JSON en el log con `herramienta`,
 * `argumentos`, `filas`, `duracionMs` y `requestId` (y `codigo` si falló); nunca el token.
 */
export function registrarHerramienta(
  servidor: McpServer,
  herramienta: HerramientaMcp,
  contexto: ContextoMcp,
  tiempoMaximoMs = TIEMPO_MAXIMO_MS,
): void {
  servidor.registerTool(
    herramienta.nombre,
    {
      description: herramienta.descripcion,
      inputSchema: soloJsonSchema(herramienta.entrada),
      outputSchema: herramienta.salida,
      annotations: { ...ANOTACIONES_SOLO_LECTURA },
    },
    async (argumentos: unknown): Promise<CallToolResult> => {
      const inicio = performance.now();
      let filas = 0;
      let codigo: CodigoErrorHerramienta | undefined;
      try {
        const validados = herramienta.entrada.safeParse(argumentos ?? {});
        if (!validados.success) {
          codigo = 'ARGUMENTO_INVALIDO';
          return resultadoError(codigo, describirProblemas(validados.error));
        }
        const salida = await conTiempoMaximo(
          herramienta.ejecutar(validados.data, contexto),
          tiempoMaximoMs,
        );
        filas = herramienta.filas(salida);
        return resultado(salida);
      } catch (error) {
        if (
          error instanceof ReglaNegocioError &&
          error.codigo === 'OBRA_NO_ENCONTRADA'
        ) {
          codigo = 'OBRA_NO_ENCONTRADA';
          return resultadoError(codigo, MENSAJE_OBRA_NO_ENCONTRADA);
        }
        codigo = 'ERROR_INTERNO';
        registro.error(
          `Falló la herramienta ${herramienta.nombre} requestId=${contexto.requestId}`,
          error instanceof Error ? error.stack : String(error),
        );
        return resultadoError(codigo, MENSAJE_ERROR_INTERNO);
      } finally {
        registro.log(
          JSON.stringify({
            herramienta: herramienta.nombre,
            argumentos: argumentos ?? {},
            filas,
            duracionMs: Math.round(performance.now() - inicio),
            requestId: contexto.requestId,
            ...(codigo ? { codigo } : {}),
          }),
        );
      }
    },
  );
}

async function conTiempoMaximo<T>(trabajo: Promise<T>, ms: number): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const agotado = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new TiempoAgotadoError(ms)), ms);
  });
  try {
    return await Promise.race([trabajo, agotado]);
  } finally {
    clearTimeout(temporizador);
  }
}

/** `structuredContent` con la salida y, por compatibilidad, el mismo JSON como texto. */
export function resultado(salida: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(salida) }],
    structuredContent: salida as Record<string, unknown>,
  };
}

/** Error de negocio como resultado (`isError: true`), no como error del protocolo. */
export function resultadoError(
  codigo: CodigoErrorHerramienta,
  mensaje: string,
): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ codigo, mensaje }) }],
    isError: true,
  };
}

/** Hasta 5 problemas, cada uno con su ruta (`limite: …`, `estados.0: …`). */
function describirProblemas(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((problema) => {
      const ruta = problema.path.map(String).join('.');
      return `${ruta || 'argumentos'}: ${problema.message}`;
    })
    .join('; ');
}

/**
 * Esquema para el SDK: publica el JSON Schema del esquema `zod` pero acepta cualquier valor (la
 * validación la hace `registrarHerramienta`, para devolver `ARGUMENTO_INVALIDO`).
 */
function soloJsonSchema(esquema: z.ZodType): StandardSchemaWithJSON {
  const estandar = esquema[
    '~standard'
  ] as unknown as StandardSchemaWithJSON['~standard'];
  return {
    '~standard': {
      version: 1,
      vendor: 'materiales',
      validate: (valor: unknown) => ({ value: valor }),
      jsonSchema: estandar.jsonSchema,
    },
  };
}
