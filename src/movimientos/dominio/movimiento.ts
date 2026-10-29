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
