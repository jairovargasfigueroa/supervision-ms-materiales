import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ESTADOS_CIERRE } from '../dominio/cierre-periodo.js';

/** `_id` de `cierre_periodo`: el `obraId` y el periodo (`AAAA-MM`) unidos por `:`. */
export function idCierrePeriodo(obraId: string, periodo: string): string {
  return `${obraId}:${periodo}`;
}

/**
 * Colección `cierre_periodo` (`docs/datos.md`): un documento por obra y periodo. Lo escribe la
 * saga «aprobar planilla» (008, `CerrarConsumos` y `ReabrirConsumos`); los movimientos (004) lo
 * leen para rechazar los de un periodo `CERRADO`.
 */
@Schema({ collection: 'cierre_periodo', versionKey: false })
export class CierrePeriodoDocumento {
  /** `idCierrePeriodo(obra_id, periodo)`: uno solo por obra y periodo. */
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: String, required: true })
  planilla_id: string;

  @Prop({ type: String, required: true, enum: ESTADOS_CIERRE })
  estado: string;

  @Prop({ type: Date, required: true })
  cerrado_en: Date;
}

export const CierrePeriodoSchema = SchemaFactory.createForClass(
  CierrePeriodoDocumento,
);
