import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type Types } from 'mongoose';
import { TIPOS_MOVIMIENTO } from '../dominio/movimiento.js';

/** Nota de remisión embebida en un ingreso (`{ numero, clave_foto }`, sin `_id` propio). */
@Schema({ _id: false, versionKey: false })
export class NotaRemisionDocumento {
  @Prop({ type: String, required: true })
  numero: string;

  /** Clave de la foto de la nota (capa 1, 102); nula hasta entonces. */
  @Prop({ type: String, default: null })
  clave_foto: string | null;
}

const NotaRemisionSchema = SchemaFactory.createForClass(NotaRemisionDocumento);

/**
 * Colección `movimiento` (`docs/datos.md`): ingresos y salidas de material. `_id` es el UUID que
 * genera el celular (idempotencia: un `id` repetido no se vuelve a registrar).
 */
@Schema({ collection: 'movimiento', versionKey: false })
export class MovimientoDocumento {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: String, required: true })
  obra_id: string;

  @Prop({ type: String, required: true })
  material_id: string;

  @Prop({ type: String, required: true, enum: TIPOS_MOVIMIENTO })
  tipo: string;

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  cantidad: Types.Decimal128;

  /** Obligatoria en salidas; nula en ingresos. */
  @Prop({ type: String, default: null })
  partida_id: string | null;

  /** Ingreso de una orden de compra (capa 2); nulo si no. */
  @Prop({ type: String, default: null })
  orden_compra_id: string | null;

  /** `AAAA-MM` en `America/La_Paz`. */
  @Prop({ type: String, required: true })
  periodo: string;

  /** `true` cuando el periodo se cerró (008). */
  @Prop({ type: Boolean, required: true, default: false })
  cerrado: boolean;

  /** La salida superó el stock que había (alerta). */
  @Prop({ type: Boolean, required: true, default: false })
  supera_stock: boolean;

  @Prop({ type: String, required: true })
  registrado_por: string;

  @Prop({ type: Date, required: true })
  registrado_en: Date;

  /** Solo en ingresos, opcional. */
  @Prop({ type: NotaRemisionSchema, default: null })
  nota_remision: NotaRemisionDocumento | null;
}

export const MovimientoSchema =
  SchemaFactory.createForClass(MovimientoDocumento);
MovimientoSchema.index(
  { obra_id: 1, periodo: 1 },
  { name: 'por_obra_periodo' },
);
MovimientoSchema.index(
  { obra_id: 1, material_id: 1 },
  { name: 'por_obra_material' },
);
MovimientoSchema.index(
  { obra_id: 1, partida_id: 1, periodo: 1 },
  { name: 'por_obra_partida_periodo' },
);
