import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { sesionActual, Transaccion } from '../mongo/transaccion.js';
import { MensajeProcesado } from './inbox.schema.js';

/**
 * Patrón inbox: aplica cada mensaje una sola vez. En la misma transacción de MongoDB guarda el
 * `id` del mensaje en `mensaje_procesado` y hace el trabajo; si algo falla no queda ninguna de
 * las dos cosas, y el mensaje se puede reintentar.
 */
@Injectable()
export class Inbox {
  constructor(
    @InjectModel(MensajeProcesado.name)
    private readonly procesados: Model<MensajeProcesado>,
    private readonly transaccion: Transaccion,
  ) {}

  /** Devuelve `false` (sin llamar a `trabajo`) si ese `id` ya se había procesado. */
  async procesarUnaVez(
    mensajeId: string,
    trabajo: () => Promise<void>,
  ): Promise<boolean> {
    try {
      return await this.transaccion.ejecutar(async () => {
        const sesion = sesionActual();
        const yaEsta = await this.procesados
          .exists({ _id: mensajeId })
          .session(sesion);
        if (yaEsta) return false;
        await this.procesados.create(
          [{ _id: mensajeId, procesado_en: new Date() }],
          { session: sesion },
        );
        await trabajo();
        return true;
      });
    } catch (error) {
      // Otro consumidor guardó el mismo id al mismo tiempo: ya está procesado.
      if (esClaveDuplicada(error)) return false;
      throw error;
    }
  }
}

/** Clave duplicada en `mensaje_procesado` (no en otra colección que escriba el trabajo). */
function esClaveDuplicada(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === 11000 &&
    typeof message === 'string' &&
    message.includes('mensaje_procesado')
  );
}
