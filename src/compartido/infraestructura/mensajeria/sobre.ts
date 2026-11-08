/**
 * Sobre común de todo mensaje de RabbitMQ (convenciones, «Eventos y comandos»). JSON en camelCase.
 */
export interface Sobre<D = Record<string, unknown>> {
  /** UUID del mensaje: es la clave del inbox (`mensaje_procesado`). */
  id: string;
  /** En PascalCase: eventos en pasado (`ObraRegistrada`), comandos en infinitivo (`CerrarConsumos`). */
  tipo: string;
  version: number;
  /** ISO-8601 en UTC. */
  ocurridoEn?: string;
  origen?: string;
  correlacionId?: string;
  datos: D;
}

/** Única versión del sobre que conoce este servicio. */
export const VERSION_SOBRE = 1;

/**
 * El mensaje no se puede procesar nunca, por más que se reintente (no es JSON, le falta el sobre,
 * versión desconocida o `datos` incompletos): va directo a `plataforma.fallidos`.
 */
export class MensajeInvalidoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'MensajeInvalidoError';
  }
}

/** Lee y valida el sobre del cuerpo de un mensaje; si no sirve, lanza `MensajeInvalidoError`. */
export function leerSobre(contenido: Buffer): Sobre {
  let valor: unknown;
  try {
    valor = JSON.parse(contenido.toString('utf8'));
  } catch {
    throw new MensajeInvalidoError('El mensaje no es JSON.');
  }
  if (!esObjeto(valor)) {
    throw new MensajeInvalidoError('El mensaje no es un objeto JSON.');
  }
  if (!esTextoNoVacio(valor.id)) {
    throw new MensajeInvalidoError('Al sobre le falta el id.');
  }
  if (!esTextoNoVacio(valor.tipo)) {
    throw new MensajeInvalidoError('Al sobre le falta el tipo.');
  }
  if (valor.version !== VERSION_SOBRE) {
    throw new MensajeInvalidoError(
      `Versión del sobre no soportada: ${String(valor.version)}.`,
    );
  }
  if (!esObjeto(valor.datos)) {
    throw new MensajeInvalidoError('Al sobre le faltan los datos.');
  }
  for (const campo of ['ocurridoEn', 'origen', 'correlacionId'] as const) {
    if (valor[campo] !== undefined && typeof valor[campo] !== 'string') {
      throw new MensajeInvalidoError(
        `El campo ${campo} del sobre no es texto.`,
      );
    }
  }
  return valor as unknown as Sobre;
}

export function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

export function esTextoNoVacio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim() !== '';
}
