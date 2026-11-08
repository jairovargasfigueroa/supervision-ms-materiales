/** Zona horaria del negocio (convenciones, «Formatos»). */
export const ZONA_NEGOCIO = 'America/La_Paz';

/** `AAAA-MM`, con mes de 01 a 12. */
export const FORMATO_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

const formato = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
});

/**
 * Periodo (`AAAA-MM`) de un registro: el mes de la fecha en `America/La_Paz` (UTC−4). Por
 * ejemplo, `2026-12-01T02:00:00Z` es el 30 de noviembre a las 22:00 en La Paz → `2026-11`.
 */
export function periodoDe(fecha: Date): string {
  const partes = formato.formatToParts(fecha);
  const parte = (tipo: 'year' | 'month') =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('year')}-${parte('month')}`;
}
