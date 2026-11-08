import type { ConsumoPartida } from '../../dominio/consumo.js';

/** Un elemento de `GET /obras/{obraId}/consumos` (`docs/contratos.md`). */
export class ConsumoRespuesta {
  partidaId: string;
  materialId: string;
  cantidad: number;

  static desde(consumo: ConsumoPartida): ConsumoRespuesta {
    return {
      partidaId: consumo.partidaId,
      materialId: consumo.materialId,
      cantidad: consumo.cantidad,
    };
  }
}
