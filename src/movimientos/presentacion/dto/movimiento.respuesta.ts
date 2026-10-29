import type { Pagina } from '../../../compartido/dominio/paginacion.js';
import type { Movimiento, TipoMovimiento } from '../../dominio/movimiento.js';

/** Elemento de `GET /obras/{obraId}/movimientos` (`docs/contratos.md`). */
export class MovimientoRespuesta {
  id: string;
  materialId: string;
  tipo: TipoMovimiento;
  cantidad: number;
  /** `null` en los ingresos. */
  partidaId: string | null;
  periodo: string;
  superaStock: boolean;
  cerrado: boolean;
  registradoPor: string;
  registradoEn: string;

  static desde(movimiento: Movimiento): MovimientoRespuesta {
    return Object.assign(new MovimientoRespuesta(), {
      id: movimiento.id,
      materialId: movimiento.materialId,
      tipo: movimiento.tipo,
      cantidad: movimiento.cantidad,
      partidaId: movimiento.partidaId,
      periodo: movimiento.periodo,
      superaStock: movimiento.superaStock,
      cerrado: movimiento.cerrado,
      registradoPor: movimiento.registradoPor,
      registradoEn: movimiento.registradoEn.toISOString(),
    });
  }

  static pagina(pagina: Pagina<Movimiento>): Pagina<MovimientoRespuesta> {
    return { ...pagina, items: pagina.items.map(MovimientoRespuesta.desde) };
  }
}
