import { Injectable, Logger } from '@nestjs/common';
import type { ConsumeMessage, Options } from 'amqplib';
import { Inbox } from './inbox.js';
import { leerSobre, MensajeInvalidoError, type Sobre } from './sobre.js';

/** Cola durable de este servicio (la declara infra; aquí solo se comprueba). */
export const COLA = 'materiales';
/** Cola de revisión de los mensajes que no se pudieron procesar (exchange por defecto). */
export const COLA_FALLIDOS = 'plataforma.fallidos';
/** Fallos de un mismo mensaje antes de mandarlo a `plataforma.fallidos`. */
export const MAXIMO_FALLOS = 3;

/** Encabezados que agrega este servicio al reintentar o descartar un mensaje. */
export const ENCABEZADO = {
  /** Veces que ya falló el mensaje (no existe en el primer intento). */
  intentos: 'x-intentos',
  /** Último error (texto corto, sin traza). */
  error: 'x-error',
  /** Cola que lo descartó (en `plataforma.fallidos`). */
  colaOrigen: 'x-cola-origen',
  /** Clave de enrutamiento original: al reintentar se publica por el exchange por defecto y se perdería. */
  claveOrigen: 'x-clave-origen',
} as const;

/** Aplica un tipo de mensaje. Si lanza `MensajeInvalidoError`, el mensaje va directo a fallidos. */
export interface ManejadorMensaje {
  manejar(sobre: Sobre): Promise<void>;
}

/** Lo que el consumidor necesita del canal de RabbitMQ (en las pruebas, un doble). */
export interface CanalMensajeria {
  /** Confirma (`ack`) el mensaje recibido. */
  confirmar(mensaje: ConsumeMessage): void;
  /** Publica en una cola por el exchange por defecto y espera la confirmación del broker. */
  publicarEnCola(
    cola: string,
    contenido: Buffer,
    opciones: Options.Publish,
  ): Promise<void>;
}

type Encabezados = Record<string, unknown>;

/**
 * Recibe cada mensaje de la cola `materiales` y lo entrega al manejador de su `tipo` dentro del
 * inbox (una sola vez por `id`). Siempre confirma el original, salvo que no pueda publicar el
 * reintento o el descarte (entonces el broker lo vuelve a entregar al reconectar):
 * - aplicado, o repetido → se confirma sin hacer nada más;
 * - sobre inválido, `datos` incompletos o tipo sin manejador → `plataforma.fallidos`;
 * - otro error → se vuelve a publicar en la misma cola con `x-intentos` + 1; al tercer fallo,
 *   a `plataforma.fallidos` con el error.
 */
@Injectable()
export class ConsumidorMensajes {
  private readonly registro = new Logger('Mensajeria');
  private readonly manejadores = new Map<string, ManejadorMensaje>();

  constructor(private readonly inbox: Inbox) {}

  /** Lo llama cada módulo en `onModuleInit` (antes de empezar a consumir). */
  registrar(tipo: string, manejador: ManejadorMensaje): void {
    if (this.manejadores.has(tipo)) {
      throw new Error(`Ya hay un manejador para ${tipo}.`);
    }
    this.manejadores.set(tipo, manejador);
  }

  async procesar(
    mensaje: ConsumeMessage,
    canal: CanalMensajeria,
  ): Promise<void> {
    const encabezados: Encabezados = { ...mensaje.properties.headers };
    const fallosPrevios = leerIntentos(encabezados[ENCABEZADO.intentos]);

    let sobre: Sobre;
    try {
      sobre = leerSobre(mensaje.content);
    } catch (error) {
      await this.descartar(mensaje, canal, fallosPrevios, mensajeDe(error));
      return;
    }

    const manejador = this.manejadores.get(sobre.tipo);
    if (!manejador) {
      // Tipos que la cola recibe pero que aún no tienen consumidor: se guardan en fallidos para
      // no perderlos (se pueden reenviar cuando exista su manejador).
      await this.descartar(
        mensaje,
        canal,
        fallosPrevios,
        `Materiales todavía no procesa mensajes de tipo ${sobre.tipo}.`,
      );
      return;
    }

    try {
      const aplicado = await this.inbox.procesarUnaVez(sobre.id, () =>
        manejador.manejar(sobre),
      );
      this.registro.log(
        `${sobre.tipo} id=${sobre.id} ${aplicado ? 'aplicado' : 'repetido, se ignora'}`,
      );
    } catch (error) {
      if (error instanceof MensajeInvalidoError) {
        await this.descartar(mensaje, canal, fallosPrevios, error.message);
        return;
      }
      const fallos = fallosPrevios + 1;
      if (fallos >= MAXIMO_FALLOS) {
        await this.descartar(mensaje, canal, fallos, mensajeDe(error));
        return;
      }
      this.registro.warn(
        `${sobre.tipo} id=${sobre.id} falló (${fallos} de ${MAXIMO_FALLOS}), se reintenta: ${mensajeDe(error)}`,
      );
      await canal.publicarEnCola(
        COLA,
        mensaje.content,
        opcionesPublicacion(mensaje, {
          ...encabezados,
          [ENCABEZADO.intentos]: fallos,
          [ENCABEZADO.error]: mensajeDe(error),
          [ENCABEZADO.claveOrigen]: claveOrigen(mensaje, encabezados),
        }),
      );
    }
    canal.confirmar(mensaje);
  }

  /** Publica el mensaje tal cual en `plataforma.fallidos`, con el error en los encabezados, y confirma el original. */
  private async descartar(
    mensaje: ConsumeMessage,
    canal: CanalMensajeria,
    fallos: number,
    error: string,
  ): Promise<void> {
    const encabezados: Encabezados = { ...mensaje.properties.headers };
    this.registro.error(
      `Mensaje enviado a ${COLA_FALLIDOS} (clave ${claveOrigen(mensaje, encabezados)}): ${error}`,
    );
    await canal.publicarEnCola(
      COLA_FALLIDOS,
      mensaje.content,
      opcionesPublicacion(mensaje, {
        ...encabezados,
        [ENCABEZADO.intentos]: fallos,
        [ENCABEZADO.error]: error,
        [ENCABEZADO.colaOrigen]: COLA,
        [ENCABEZADO.claveOrigen]: claveOrigen(mensaje, encabezados),
      }),
    );
    canal.confirmar(mensaje);
  }
}

function opcionesPublicacion(
  mensaje: ConsumeMessage,
  headers: Encabezados,
): Options.Publish {
  const { contentType, messageId, correlationId, timestamp, type } =
    mensaje.properties;
  return {
    persistent: true,
    contentType: contentType ?? 'application/json',
    ...(messageId ? { messageId } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(timestamp ? { timestamp } : {}),
    ...(type ? { type } : {}),
    headers,
  };
}

function claveOrigen(
  mensaje: ConsumeMessage,
  encabezados: Encabezados,
): string {
  const guardada = encabezados[ENCABEZADO.claveOrigen];
  return typeof guardada === 'string' ? guardada : mensaje.fields.routingKey;
}

function leerIntentos(valor: unknown): number {
  const numero = Number(valor ?? 0);
  return Number.isInteger(numero) && numero > 0 ? numero : 0;
}

/** Texto corto del error para el registro y el encabezado (sin traza ni datos del mensaje). */
function mensajeDe(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  return texto.length > 500 ? `${texto.slice(0, 497)}...` : texto;
}
