import type { FilaStock } from '../../aplicacion/fila-stock.js';
import type { EstadoStock } from '../../dominio/stock-obra.js';

/** Fila de `GET /obras/{obraId}/stock` y respuesta de `PUT .../minimo` (`docs/contratos.md`). */
export class StockRespuesta {
  materialId: string;
  codigo: string;
  nombre: string;
  unidad: string;
  unidadPlural: string;
  cantidad: number;
  minimo: number;
  estado: EstadoStock;

  static desde({ stock, material }: FilaStock): StockRespuesta {
    return Object.assign(new StockRespuesta(), {
      materialId: material.id,
      codigo: material.codigo,
      nombre: material.nombre,
      unidad: material.unidad,
      unidadPlural: material.unidadPlural,
      cantidad: stock.cantidad,
      minimo: stock.minimo,
      estado: stock.estado,
    });
  }
}
