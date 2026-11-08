import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ORIGEN } from './outbox.js';
import { OutboxEvento } from './outbox.schema.js';
import { RabbitCliente } from './rabbit.cliente.js';

/** Cada cuánto se buscan eventos por publicar (convenciones: cada segundo). */
export const INTERVALO_OUTBOX_MS = 1000;
/** Eventos que se publican como máximo en cada vuelta. */
export const LOTE_OUTBOX = 100;

/** Clave de enrutamiento de un evento de este servicio: `evento.materiales.<Tipo>`. */
export function claveEvento(tipo: string): string {
  return `evento.${ORIGEN}.${tipo}`;
}

/**
 * Publica cada segundo los eventos pendientes de `outbox_evento` en el exchange `plataforma`
 * (persistentes, `application/json`, `messageId` = `id` del sobre), en el orden en que se
 * guardaron, y los marca publicados cuando el broker confirma. Si RabbitMQ no está conectado o
 * una publicación falla, se detiene y lo intenta en la vuelta siguiente: un evento puede salir
 * dos veces (si se cae justo después de publicar), nunca ninguna; los consumidores descartan
 * los repetidos por `id` (inbox).
 */
@Injectable()
export class OutboxPublicador
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly registro = new Logger('Outbox');
  private temporizador?: NodeJS.Timeout;
  private publicando = false;

  constructor(
    @InjectModel(OutboxEvento.name)
    private readonly eventos: Model<OutboxEvento>,
    private readonly rabbit: RabbitCliente,
  ) {}

  onApplicationBootstrap(): void {
    this.temporizador = setInterval(
      () => void this.publicarPendientes(),
      INTERVALO_OUTBOX_MS,
    );
  }

  onModuleDestroy(): void {
    clearInterval(this.temporizador);
  }

  /** Una vuelta: devuelve cuántos eventos publicó. */
  async publicarPendientes(): Promise<number> {
    // Una vuelta lenta no se pisa con la siguiente.
    if (this.publicando || !this.rabbit.conectado) return 0;
    this.publicando = true;
    let publicados = 0;
    try {
      const pendientes = await this.eventos
        .find({ publicado_en: null })
        .sort({ creado_en: 1, _id: 1 })
        .limit(LOTE_OUTBOX)
        .lean();
      for (const evento of pendientes) {
        await this.rabbit.publicar(
          claveEvento(evento.tipo),
          Buffer.from(JSON.stringify(evento.payload)),
          {
            persistent: true,
            contentType: 'application/json',
            messageId: evento._id,
          },
        );
        await this.eventos.updateOne(
          { _id: evento._id, publicado_en: null },
          { $set: { publicado_en: new Date() } },
        );
        publicados++;
        this.registro.log(`${evento.tipo} id=${evento._id} publicado`);
      }
    } catch (error) {
      this.registro.warn(
        `No se pudo publicar el outbox; se reintenta en ${INTERVALO_OUTBOX_MS / 1000} s: ${(error as Error).message}`,
      );
    } finally {
      this.publicando = false;
    }
    return publicados;
  }
}
