import type { EstadoStock } from '../../../stock/dominio/stock-obra.js';
import type { ResultadoRegistro } from '../../aplicacion/casos-uso/registrar-movimiento.caso-uso.js';

/** Stock del material en la obra después del movimiento. */
export interface StockMovimientoRespuesta {
  cantidad: number;
  minimo: number;
  estado: EstadoStock;
}

/** Respuesta de `POST /movimientos` (`docs/contratos.md`). */
export class MovimientoRegistradoRespuesta {
  id: string;
  periodo: string;
  superaStock: boolean;
  stock: StockMovimientoRespuesta;

  static desde({
    movimiento,
    stock,
  }: ResultadoRegistro): MovimientoRegistradoRespuesta {
    return Object.assign(new MovimientoRegistradoRespuesta(), {
      id: movimiento.id,
      periodo: movimiento.periodo,
      superaStock: movimiento.superaStock,
      stock: {
        cantidad: stock.cantidad,
        minimo: stock.minimo,
        estado: stock.estado,
      },
    });
  }
}
