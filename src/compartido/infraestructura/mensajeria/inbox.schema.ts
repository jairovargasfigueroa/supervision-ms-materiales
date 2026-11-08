import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Mensaje de RabbitMQ ya aplicado (patrón inbox, `docs/datos.md`): `_id` es el `id` del sobre. */
@Schema({ collection: 'mensaje_procesado', versionKey: false })
export class MensajeProcesado {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: Date, required: true })
  procesado_en: Date;
}

export const MensajeProcesadoSchema =
  SchemaFactory.createForClass(MensajeProcesado);
