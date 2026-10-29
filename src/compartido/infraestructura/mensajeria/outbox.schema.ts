import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';

/**
 * Mensaje por publicar en RabbitMQ (patrón outbox, `docs/datos.md`): se guarda en la misma
 * transacción que el dato y `OutboxPublicador` lo publica. `_id` es el `id` del sobre.
 */
@Schema({ collection: 'outbox_evento', versionKey: false })
export class OutboxEvento {
  @Prop({ type: String, required: true })
  _id: string;

  /** `tipo` del sobre (por ejemplo `StockBajo`). */
  @Prop({ type: String, required: true })
  tipo: string;

  /** Sobre completo del mensaje, tal como se publica. */
  @Prop({ type: SchemaTypes.Mixed, required: true })
  payload: Record<string, unknown>;

  @Prop({ type: Date, required: true })
  creado_en: Date;

  /** Nulo hasta que el broker confirma la publicación. */
  @Prop({ type: Date, default: null })
  publicado_en: Date | null;
}

export const OutboxEventoSchema = SchemaFactory.createForClass(OutboxEvento);
OutboxEventoSchema.index(
  { publicado_en: 1, creado_en: 1 },
  { name: 'pendientes' },
);
