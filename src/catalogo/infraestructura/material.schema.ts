import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type Types } from 'mongoose';
import { TIPOS_MATERIAL } from '../dominio/tipo-material.js';

/** Atributo embebido del material (`{ nombre, valor }`, sin `_id` propio). */
@Schema({ _id: false, versionKey: false })
export class AtributoDocumento {
  @Prop({ type: String, required: true })
  nombre: string;

  @Prop({ type: String, required: true })
  valor: string;
}

const AtributoSchema = SchemaFactory.createForClass(AtributoDocumento);

/** Colección `material` (`docs/datos.md`): `_id` es un UUID y `codigo` es único. */
@Schema({ collection: 'material', versionKey: false })
export class MaterialDocumento {
  @Prop({ type: String, required: true })
  _id: string;

  /** En mayúsculas y sin espacios a los costados. */
  @Prop({ type: String, required: true })
  codigo: string;

  @Prop({ type: String, required: true })
  nombre: string;

  @Prop({ type: String, required: true, enum: TIPOS_MATERIAL })
  tipo: string;

  @Prop({ type: String, required: true })
  unidad: string;

  @Prop({ type: String, required: true })
  unidad_plural: string;

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  precio_referencial: Types.Decimal128;

  @Prop({ type: Boolean, required: true })
  activo: boolean;

  @Prop({ type: [AtributoSchema], default: [] })
  atributos: AtributoDocumento[];
}

export const MaterialSchema = SchemaFactory.createForClass(MaterialDocumento);
MaterialSchema.index({ codigo: 1 }, { unique: true, name: 'codigo_unico' });
