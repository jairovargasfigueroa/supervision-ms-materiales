import { FORMATO_PERIODO, periodoDe } from './periodo.js';

describe('periodoDe (mes en America/La_Paz)', () => {
  it.each([
    ['2026-11-15T14:00:00Z', '2026-11'],
    // 1 de diciembre 03:59 UTC = 30 de noviembre 23:59 en La Paz
    ['2026-12-01T03:59:59Z', '2026-11'],
    ['2026-12-01T04:00:00Z', '2026-12'],
    // fin de año
    ['2027-01-01T03:00:00Z', '2026-12'],
    ['2027-01-01T04:00:00Z', '2027-01'],
    // con desfase explícito
    ['2026-11-30T23:30:00-04:00', '2026-11'],
  ])('%s → %s', (fecha, periodo) => {
    expect(periodoDe(new Date(fecha))).toBe(periodo);
  });

  it('FORMATO_PERIODO acepta AAAA-MM con mes de 01 a 12', () => {
    expect(FORMATO_PERIODO.test('2026-11')).toBe(true);
    for (const malo of [
      '2026-13',
      '2026-00',
      '2026-1',
      '26-11',
      '2026-11-01',
    ]) {
      expect(FORMATO_PERIODO.test(malo)).toBe(false);
    }
  });
});
