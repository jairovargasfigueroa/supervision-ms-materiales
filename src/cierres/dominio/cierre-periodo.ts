/** Estados del cierre de un periodo de una obra (`cierre_periodo`). */
export const ESTADOS_CIERRE = ['CERRADO', 'REABIERTO'] as const;
export type EstadoCierre = (typeof ESTADOS_CIERRE)[number];

/** Cierre de los consumos de una obra en un periodo (`AAAA-MM`): uno solo por obra y periodo. */
export interface CierrePeriodo {
  obraId: string;
  periodo: string;
  /** Planilla que lo cerró (o lo cerró y lo reabrió). */
  planillaId: string;
  estado: EstadoCierre;
  cerradoEn: Date;
}

/**
 * Qué hacer con `CerrarConsumos` (008, diseño):
 * - `CERRAR`: no hay cierre o está `REABIERTO` → pasa a `CERRADO` con esta planilla;
 * - `YA_CERRADO`: ya está `CERRADO` por la misma planilla → se responde igual, sin cambios;
 * - `CERRADO_POR_OTRA`: está `CERRADO` por otra planilla → `CierreFallido`.
 */
export type DecisionCierre = 'CERRAR' | 'YA_CERRADO' | 'CERRADO_POR_OTRA';

export function decidirCierre(
  actual: CierrePeriodo | null,
  planillaId: string,
): DecisionCierre {
  if (!actual || actual.estado === 'REABIERTO') return 'CERRAR';
  return actual.planillaId === planillaId ? 'YA_CERRADO' : 'CERRADO_POR_OTRA';
}

/**
 * Qué hacer con `ReabrirConsumos` (compensación de la saga, idempotente):
 * - `REABRIR`: está `CERRADO` por esta planilla → pasa a `REABIERTO`;
 * - `YA_REABIERTO`: no hay cierre, o ya está `REABIERTO` por esta planilla → nada que cambiar;
 * - `DE_OTRA_PLANILLA`: el cierre es de otra planilla → no se toca (no se reabre lo que cerró otra).
 */
export type DecisionReapertura =
  'REABRIR' | 'YA_REABIERTO' | 'DE_OTRA_PLANILLA';

export function decidirReapertura(
  actual: CierrePeriodo | null,
  planillaId: string,
): DecisionReapertura {
  if (!actual) return 'YA_REABIERTO';
  if (actual.planillaId !== planillaId) return 'DE_OTRA_PLANILLA';
  return actual.estado === 'CERRADO' ? 'REABRIR' : 'YA_REABIERTO';
}

/** `motivo` de `CierreFallido` cuando otra planilla ya cerró el periodo (`docs/mensajes.md`). */
export function motivoCerradoPorOtra(periodo: string): string {
  return `Los consumos del periodo ${periodo} ya fueron cerrados por otra planilla`;
}
