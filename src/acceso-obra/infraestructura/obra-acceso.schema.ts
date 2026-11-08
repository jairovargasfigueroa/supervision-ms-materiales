import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Colección `obra_acceso` (`docs/datos.md`): `_id` es el `obraId` de Obras. */
@Schema({ collection: 'obra_acceso', versionKey: false })
export class ObraAccesoDocumento {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: String, required: true })
  nombre: string;

  @Prop({ type: String, required: true })
  residente_id: string;

  @Prop({ type: String, required: true })
  maestro_id: string;

  @Prop({ type: String, required: true })
  almacenero_id: string;

  @Prop({ type: String, required: true })
  cliente_id: string;

  @Prop({ type: Date, required: true })
  actualizado_en: Date;
}

export const ObraAccesoSchema =
  SchemaFactory.createForClass(ObraAccesoDocumento);
