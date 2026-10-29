import type { ResumenStockObra } from '../../dominio/stock-obra.js';

/** Elemento de `GET /stock/resumen` (`docs/contratos.md`). */
export class ResumenStockRespuesta {
  obraId: string;
  materialesBajos: number;

  static desde({
    obraId,
    materialesBajos,
  }: ResumenStockObra): ResumenStockRespuesta {
    return Object.assign(new ResumenStockRespuesta(), {
      obraId,
      materialesBajos,
    });
  }
}
