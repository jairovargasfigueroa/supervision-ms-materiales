import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type Types } from 'mongoose';

/** `_id` de `stock_obra`: el `obraId` y el `materialId` unidos por `:`. */
export function idStockObra(obraId: string, materialId: string): string {
  return `${obraId}:${materialId}`;
}

/**
 * Colección `stock_obra` (`docs/datos.md`): una fila por material con movimientos o mínimo en una
 * obra. El estado (`BAJO`, `JUSTO`, `OK`) no se guarda: se calcula al leer.
 */
@Schema({ collection: 'stock_obra', versionKey: false })
export class StockObraDocumento {
  /** `idStockObra(obra_id, material_id)`. */
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: String, required: true })
  obra_id: string;

  @Prop({ type: String, required: true })
  material_id: string;

  /** Se recalcula con los movimientos (004); nunca se escribe a mano. */
  @Prop({ type: SchemaTypes.Decimal128, required: true })
  cantidad: Types.Decimal128;

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  minimo: Types.Decimal128;

  /** Control de concurrencia: sube en 1 con cada cambio. */
  @Prop({ type: Number, required: true })
  version: number;

  @Prop({ type: Date, required: true })
  actualizado_en: Date;
}

export const StockObraSchema = SchemaFactory.createForClass(StockObraDocumento);
StockObraSchema.index({ obra_id: 1 }, { name: 'por_obra' });
