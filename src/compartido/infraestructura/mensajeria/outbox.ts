import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { sesionActual } from '../mongo/transaccion.js';
import { OutboxEvento } from './outbox.schema.js';
import { type Sobre, VERSION_SOBRE } from './sobre.js';

/** `origen` de los mensajes que publica este servicio. */
export const ORIGEN = 'materiales';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Patrón outbox (convenciones, «Eventos y comandos»): guarda el sobre del evento en
 * `outbox_evento` dentro de la transacción de MongoDB en curso, junto con el dato que lo
 * origina; `OutboxPublicador` lo publica después. Fuera de una transacción falla, para que
 * nunca se guarde un evento sin su dato (o al revés).
 */
@Injectable()
export class Outbox {
  constructor(
    @InjectModel(OutboxEvento.name)
    private readonly eventos: Model<OutboxEvento>,
  ) {}

  /**
   * `correlacionId`: el del flujo que lo originó (por ejemplo el `X-Request-Id`, si es un UUID);
   * si no hay, el `id` del propio mensaje.
   */
  async agregar<D extends Record<string, unknown>>(
    tipo: string,
    datos: D,
    correlacionId?: string,
  ): Promise<Sobre<D>> {
    const sesion = sesionActual();
    if (!sesion) {
      throw new Error('El outbox se escribe dentro de una transacción.');
    }
    const id = randomUUID();
    const ahora = new Date();
    const sobre: Sobre<D> = {
      id,
      tipo,
      version: VERSION_SOBRE,
      ocurridoEn: ahora.toISOString(),
      origen: ORIGEN,
      correlacionId:
        correlacionId && UUID.test(correlacionId) ? correlacionId : id,
      datos,
    };
    await this.eventos.create(
      [
        {
          _id: id,
          tipo,
          payload: sobre as unknown as Record<string, unknown>,
          creado_en: ahora,
          publicado_en: null,
        },
      ],
      { session: sesion },
    );
    return sobre;
  }
}
