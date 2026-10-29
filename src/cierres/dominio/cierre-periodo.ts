/** Estados del cierre de un periodo de una obra (`cierre_periodo`). */
export const ESTADOS_CIERRE = ['CERRADO', 'REABIERTO'] as const;
export type EstadoCierre = (typeof ESTADOS_CIERRE)[number];
