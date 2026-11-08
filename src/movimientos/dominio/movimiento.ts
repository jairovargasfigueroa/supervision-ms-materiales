import { aMilesimas } from '../../compartido/dominio/cantidad.js';
import { ReglaNegocioError } from '../../compartido/dominio/regla-negocio.error.js';

/** Tipos de movimiento de material (reglas del negocio, «Material y stock»). */
export const TIPOS_MOVIMIENTO = ['INGRESO', 'SALIDA'] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

/** Nota de remisión de un ingreso. La foto (`claveFoto`) se agrega en la capa 1 (102). */
export interface NotaRemision {
  numero: string;
  claveFoto: string | null;
}

/**
 * Ingreso o salida de material en una obra (`movimiento`). Es un hecho: no se edita ni se anula
 * (004, fuera del alcance); el stock se recalcula con ellos. El `id` lo genera el celular.
 */
export interface Movimiento {
  readonly id: string;
  readonly obraId: string;
  readonly materialId: string;
  readonly tipo: TipoMovimiento;
  /** Mayor que 0, hasta 3 decimales. */
  readonly cantidad: number;
  /** Partida de destino: obligatoria en salidas, `null` en ingresos. */
  readonly partidaId: string | null;
  /** Orden de compra de la que viene un ingreso (capa 2); `null` si no. */
  readonly ordenCompraId: string | null;
  /** `AAAA-MM`: mes de `registradoEn` en `America/La_Paz`. */
  readonly periodo: string;
  /** `true` cuando una planilla aprobada cerró el periodo (008). */
  readonly cerrado: boolean;
  /** La salida superó el stock que había: se registra igual y queda como alerta. */
  readonly superaStock: boolean;
  /** `sub` del token de quien lo registró. */
  readonly registradoPor: string;
  readonly registradoEn: Date;
  /** Solo en ingresos, opcional. */
  readonly notaRemision: NotaRemision | null;
}

/** Cuánto cambia el stock con el movimiento: suma en un ingreso, resta en una salida. */
export function ajusteDeStock(tipo: TipoMovimiento, cantidad: number): number {
  return tipo === 'INGRESO' ? cantidad : -cantidad;
}

/**
 * Una salida mayor que el stock que había antes se registra igual y queda como alerta
 * (reglas del negocio, «Material y stock»; 004, criterio 5). Se compara en milésimas.
 */
export function superaElStock(
  tipo: TipoMovimiento,
  cantidad: number,
  stockPrevio: number,
): boolean {
  return tipo === 'SALIDA' && aMilesimas(stockPrevio) < aMilesimas(cantidad);
}

/** `409 PERIODO_CERRADO` (`docs/mensajes.md`): «El periodo AAAA-MM ya está cerrado». */
export function periodoCerrado(periodo: string): ReglaNegocioError {
  return new ReglaNegocioError(
    'PERIODO_CERRADO',
    `El periodo ${periodo} ya está cerrado`,
    409,
  );
}

/**
 * `datos` del evento `MovimientoRegistrado` (`docs/contratos/eventos.md`): lo usa la base de
 * reportes de la capa 4. `partidaId` es `null` en los ingresos. `precioReferencial` (401) es el
 * precio del material al registrar el movimiento: el movimiento no lo guarda, solo viaja en el
 * evento.
 */
export function datosMovimientoRegistrado(
  movimiento: Movimiento,
  precioReferencial: number,
) {
  return {
    movimientoId: movimiento.id,
    obraId: movimiento.obraId,
    materialId: movimiento.materialId,
    tipo: movimiento.tipo,
    cantidad: movimiento.cantidad,
    precioReferencial,
    partidaId: movimiento.partidaId,
    periodo: movimiento.periodo,
    superaStock: movimiento.superaStock,
    registradoEn: movimiento.registradoEn.toISOString(),
  };
}
