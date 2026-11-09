import type {
  CriteriosPagina,
  Pagina,
} from '../../../compartido/dominio/paginacion.js';
import type {
  ConsumoPartida,
  ResumenSalidasPartida,
} from '../../dominio/consumo.js';
import type { Movimiento } from '../../dominio/movimiento.js';

export const MOVIMIENTO_REPOSITORIO = Symbol('MOVIMIENTO_REPOSITORIO');

/** Campos por los que se puede ordenar `GET /obras/{obraId}/movimientos` (por defecto `registradoEn desc`). */
export const ORDENES_MOVIMIENTO = ['registradoEn'] as const;
export type OrdenMovimiento = (typeof ORDENES_MOVIMIENTO)[number];

export interface FiltroMovimientos {
  /** `AAAA-MM`; sin él, todos los periodos. */
  periodo?: string;
}

/**
 * Ya hay un movimiento con ese `id` (otro envío del mismo registro llegó primero). El caso de uso
 * lo trata como un envío repetido: devuelve el existente.
 */
export class MovimientoRepetidoError extends Error {
  constructor(readonly id: string) {
    super(`Ya existe el movimiento ${id}.`);
    this.name = 'MovimientoRepetidoError';
  }
}

export interface MovimientoRepositorio {
  buscar(id: string): Promise<Movimiento | null>;
  /** Inserta el movimiento; si el `id` ya existe, `MovimientoRepetidoError`. */
  crear(movimiento: Movimiento): Promise<void>;
  /** Movimientos de la obra, paginados. */
  listar(
    obraId: string,
    filtro: FiltroMovimientos,
    criterios: CriteriosPagina<OrdenMovimiento>,
  ): Promise<Pagina<Movimiento>>;
  /**
   * Suma de las salidas de la obra en el periodo, por partida y material (006), ordenada por
   * `partidaId` y `materialId`. Los ingresos no cuentan.
   */
  sumarSalidas(obraId: string, periodo: string): Promise<ConsumoPartida[]>;
  /**
   * Como `sumarSalidas`, con el número de salidas y cuántas superaron el stock (501), de las obras
   * pedidas (una o un lote, 505); solo de `partidaId` si viene. Ordenado por `obraId`, `partidaId`
   * y `materialId`. Solo lectura.
   */
  resumirSalidas(
    obraIds: readonly string[],
    periodo: string,
    partidaId?: string,
  ): Promise<ResumenSalidasPartida[]>;
}
