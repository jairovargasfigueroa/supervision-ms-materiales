import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
  type Options,
} from 'amqplib';
import {
  type CanalMensajeria,
  COLA,
  COLA_FALLIDOS,
  ConsumidorMensajes,
} from './consumidor.js';

/** Exchange `topic` de la plataforma (lo declara infra). */
export const EXCHANGE = 'plataforma';
/** Claves que escucha la cola `materiales` (`docs/contratos.md`). */
export const CLAVES_ESCUCHADAS = [
  'evento.obras.ObraRegistrada',
  'comando.materiales.CerrarConsumos',
  'comando.materiales.ReabrirConsumos',
] as const;
/** Mensajes sin confirmar que se reciben a la vez. */
export const PREFETCH = 10;
const ESPERA_RECONEXION_MS = 5000;

/**
 * Conexión a RabbitMQ (`RABBITMQ_URL`). Al arrancar la app comprueba la topología (exchange
 * `plataforma`, colas `materiales` y `plataforma.fallidos`, y los enlaces de la cola, con los
 * mismos argumentos que `infra/rabbitmq/definiciones.json`: durables y sin argumentos) y consume
 * la cola con confirmación manual. La app arranca aunque RabbitMQ no esté: reintenta cada 5 s
 * y vuelve a conectar si se corta. `GET /salud` no depende de esto. Por el mismo canal (con
 * confirmaciones del broker) publica los eventos del outbox (`publicar`).
 */
@Injectable()
export class RabbitCliente
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly registro = new Logger('RabbitMQ');
  private conexion?: ChannelModel;
  private canal?: ConfirmChannel;
  private reconexion?: NodeJS.Timeout;
  private cerrando = false;

  constructor(
    private readonly config: ConfigService,
    private readonly consumidor: ConsumidorMensajes,
  ) {}

  onApplicationBootstrap(): void {
    void this.conectar();
  }

  /** `true` mientras hay canal abierto (se puede publicar). */
  get conectado(): boolean {
    return this.canal !== undefined;
  }

  /**
   * Publica en el exchange `plataforma` con esa clave y espera la confirmación del broker. Sin
   * conexión, o si el broker no la acepta, falla (el outbox lo reintenta).
   */
  publicar(
    clave: string,
    contenido: Buffer,
    opciones: Options.Publish,
  ): Promise<void> {
    const canal = this.canal;
    if (!canal) return Promise.reject(new Error('Sin conexión a RabbitMQ.'));
    return new Promise<void>((resolver, rechazar) => {
      canal.publish(EXCHANGE, clave, contenido, opciones, (error) =>
        error ? rechazar(error as Error) : resolver(),
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    this.cerrando = true;
    clearTimeout(this.reconexion);
    await this.conexion?.close().catch(() => undefined);
  }

  private async conectar(): Promise<void> {
    const url = this.config.get<string>('RABBITMQ_URL');
    if (!url) {
      this.registro.warn('Falta RABBITMQ_URL: no se consumen mensajes.');
      return;
    }
    try {
      const conexion = await connect(url);
      this.conexion = conexion;
      conexion.on('error', (error: Error) =>
        this.registro.warn(`Error de la conexión: ${error.message}`),
      );
      conexion.on('close', () => {
        this.conexion = undefined;
        this.canal = undefined;
        if (!this.cerrando) {
          this.registro.warn('Se cerró la conexión; se vuelve a conectar.');
          this.programarReconexion();
        }
      });
      const canal = await conexion.createConfirmChannel();
      canal.on('error', (error: Error) =>
        this.registro.warn(`Error del canal: ${error.message}`),
      );
      // Si el broker cierra solo el canal, se cierra la conexión para volver a empezar.
      canal.on('close', () => {
        this.canal = undefined;
        if (!this.cerrando) void conexion.close().catch(() => undefined);
      });
      await prepararTopologia(canal);
      await canal.prefetch(PREFETCH);
      const adaptador = adaptarCanal(canal);
      await canal.consume(
        COLA,
        (mensaje) => {
          if (!mensaje) {
            // El broker canceló el consumo (por ejemplo, borraron la cola): se reconecta.
            this.registro.warn(`Se canceló el consumo de la cola ${COLA}.`);
            void conexion.close().catch(() => undefined);
            return;
          }
          this.consumidor.procesar(mensaje, adaptador).catch((error) =>
            // No se confirmó: RabbitMQ lo vuelve a entregar al cerrarse el canal.
            this.registro.error(
              `No se pudo procesar ni reintentar un mensaje: ${(error as Error).message}`,
            ),
          );
        },
        { noAck: false },
      );
      this.canal = canal;
      this.registro.log(`Conectado; consumiendo la cola ${COLA}.`);
    } catch (error) {
      this.registro.warn(
        `No se pudo conectar a RabbitMQ (${(error as Error).message}); se reintenta en ${ESPERA_RECONEXION_MS / 1000} s.`,
      );
      await this.conexion?.close().catch(() => undefined);
      this.programarReconexion();
    }
  }

  private programarReconexion(): void {
    if (this.cerrando || this.reconexion) return;
    this.reconexion = setTimeout(() => {
      this.reconexion = undefined;
      void this.conectar();
    }, ESPERA_RECONEXION_MS);
  }
}

/** Idempotente: con los mismos argumentos que infra no cambia nada; si falta algo, lo crea. */
export async function prepararTopologia(canal: ConfirmChannel): Promise<void> {
  await canal.assertExchange(EXCHANGE, 'topic', { durable: true });
  await canal.assertQueue(COLA, { durable: true });
  await canal.assertQueue(COLA_FALLIDOS, { durable: true });
  for (const clave of CLAVES_ESCUCHADAS) {
    await canal.bindQueue(COLA, EXCHANGE, clave);
  }
}

function adaptarCanal(canal: ConfirmChannel): CanalMensajeria {
  return {
    confirmar: (mensaje: ConsumeMessage) => canal.ack(mensaje),
    publicarEnCola: (cola, contenido, opciones) =>
      new Promise<void>((resolver, rechazar) => {
        canal.sendToQueue(cola, contenido, opciones, (error) =>
          error ? rechazar(error as Error) : resolver(),
        );
      }),
  };
}
