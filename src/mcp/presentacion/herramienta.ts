import type {
  CallToolResult,
  McpServer,
  StandardSchemaWithJSON,
} from '@modelcontextprotocol/server';
import type { z } from 'zod';
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
  ejecutar(argumentos: z.output<E>, contexto: ContextoMcp): Promise<z.output<S>>;
  /** Filas devueltas, para el registro de la llamada. */
  filas(salida: z.output<S>): number;
}

/** Códigos de error de herramienta (501, diseño, «Errores como resultado»). */
export type CodigoErrorHerramienta =
  | 'ARGUMENTO_INVALIDO'
  | 'OBRA_NO_ENCONTRADA'
  | 'ERROR_INTERNO';

/** Las anotaciones con que se anuncia cada herramienta. */
export const ANOTACIONES_SOLO_LECTURA = {
  readOnlyHint: true,
  openWorldHint: false,
} as const;

/**
 * Registra la herramienta en el servidor. El SDK no valida los argumentos (recibe un esquema que
 * solo aporta el JSON Schema): si validara, respondería con su propio texto. Aquí se validan con
 * el esquema estricto y, si no cumplen, el resultado es `ARGUMENTO_INVALIDO` sin llamar al caso
 * de uso (no se consulta la base).
 */
export function registrarHerramienta(
  servidor: McpServer,
  herramienta: HerramientaMcp,
  contexto: ContextoMcp,
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
      const validados = herramienta.entrada.safeParse(argumentos ?? {});
      if (!validados.success) {
        return resultadoError(
          'ARGUMENTO_INVALIDO',
          describirProblemas(validados.error),
        );
      }
      const salida = await herramienta.ejecutar(validados.data, contexto);
      return resultado(salida);
    },
  );
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
  const estandar = esquema['~standard'] as unknown as StandardSchemaWithJSON['~standard'];
  return {
    '~standard': {
      version: 1,
      vendor: 'materiales',
      validate: (valor: unknown) => ({ value: valor }),
      jsonSchema: estandar.jsonSchema,
    },
  };
}
