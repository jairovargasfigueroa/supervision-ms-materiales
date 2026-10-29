import type { ConsumeMessage, MessagePropertyHeaders, Options } from 'amqplib';
import type { CanalMensajeria } from '../../src/compartido/infraestructura/mensajeria/consumidor.js';

/** Lo que el consumidor publicó en una cola (por el exchange por defecto). */
export interface Publicado {
  cola: string;
  cuerpo: unknown;
  opciones: Options.Publish;
}

/** Doble del canal de RabbitMQ: guarda lo confirmado y lo publicado (no hace falta servidor). */
export class CanalPrueba implements CanalMensajeria {
  readonly confirmados: ConsumeMessage[] = [];
  readonly publicados: Publicado[] = [];
  /** Si se pone, `publicarEnCola` falla con este error (broker caído). */
  fallarAlPublicar?: Error;

  confirmar(mensaje: ConsumeMessage): void {
    this.confirmados.push(mensaje);
  }

  publicarEnCola(
    cola: string,
    contenido: Buffer,
    opciones: Options.Publish,
  ): Promise<void> {
    if (this.fallarAlPublicar) return Promise.reject(this.fallarAlPublicar);
    this.publicados.push({
      cola,
      cuerpo: JSON.parse(contenido.toString('utf8')) as unknown,
      opciones,
    });
    return Promise.resolve();
  }
}

/** Sobre de un mensaje como lo publica otro servicio. */
export function sobrePrueba(
  tipo: string,
  datos: Record<string, unknown>,
  id: string = crypto.randomUUID(),
): Record<string, unknown> {
  return {
    id,
    tipo,
    version: 1,
    ocurridoEn: '2026-10-29T14:30:00Z',
    origen: 'obras',
    correlacionId: crypto.randomUUID(),
    datos,
  };
}

/** Mensaje recibido de la cola `materiales` con ese cuerpo (objeto en JSON, o texto tal cual). */
export function mensajePrueba(
  cuerpo: unknown,
  claveEnrutamiento = 'evento.obras.ObraRegistrada',
  encabezados: MessagePropertyHeaders = {},
): ConsumeMessage {
  const contenido = Buffer.from(
    typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  );
  return {
    content: contenido,
    fields: {
      deliveryTag: 1,
      redelivered: false,
      exchange: 'plataforma',
      routingKey: claveEnrutamiento,
      consumerTag: 'prueba',
    },
    properties: {
      contentType: 'application/json',
      contentEncoding: undefined,
      headers: encabezados,
      deliveryMode: 2,
      priority: undefined,
      correlationId: undefined,
      replyTo: undefined,
      expiration: undefined,
      messageId: undefined,
      timestamp: undefined,
      type: undefined,
      userId: undefined,
      appId: undefined,
      clusterId: undefined,
    },
  };
}

/** `datos` completos de `ObraRegistrada` (contrato de eventos, 002). */
export function datosObraRegistrada(
  cambios: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    obraId: 'b2c3d4e5-0000-4000-8000-000000000001',
    nombre: 'Edificio Las Palmas',
    fechaInicio: '2026-11-02',
    asignaciones: {
      residenteId: 'residente-1',
      maestroId: 'maestro-1',
      almaceneroId: 'almacenero-1',
      clienteId: 'cliente-1',
    },
    contrato: {
      monto: 1500000,
      plazoDias: 365,
      anticipoPct: 10,
      retencionPct: 5,
      firmadoEn: '2026-10-28',
    },
    ...cambios,
  };
}

/** Lo que el outbox publicó en el exchange `plataforma`. */
export interface PublicadoExchange {
  clave: string;
  cuerpo: Record<string, unknown>;
  opciones: Options.Publish;
}

/**
 * Doble de `RabbitCliente` para el publicador del outbox: guarda lo publicado (sin servidor).
 * `conectado = false` simula RabbitMQ caído; `fallarEn` hace fallar la publicación número N.
 */
export class RabbitPrueba {
  conectado = true;
  readonly publicados: PublicadoExchange[] = [];
  fallarEn?: number;
  private intentos = 0;

  /** Vuelve al estado inicial (conectado, sin publicados ni fallas). */
  reiniciar(): void {
    this.conectado = true;
    this.publicados.length = 0;
    this.fallarEn = undefined;
    this.intentos = 0;
  }

  publicar(
    clave: string,
    contenido: Buffer,
    opciones: Options.Publish,
  ): Promise<void> {
    this.intentos++;
    if (this.fallarEn === this.intentos) {
      return Promise.reject(new Error('el broker no confirmó'));
    }
    this.publicados.push({
      clave,
      cuerpo: JSON.parse(contenido.toString('utf8')) as Record<string, unknown>,
      opciones,
    });
    return Promise.resolve();
  }
}
