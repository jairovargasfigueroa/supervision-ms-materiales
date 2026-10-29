import {
  type CierrePeriodo,
  decidirCierre,
  decidirReapertura,
  motivoCerradoPorOtra,
} from './cierre-periodo.js';

const cierre = (cambios: Partial<CierrePeriodo> = {}): CierrePeriodo => ({
  obraId: 'obra-1',
  periodo: '2026-11',
  planillaId: 'planilla-1',
  estado: 'CERRADO',
  cerradoEn: new Date('2026-12-02T14:00:00Z'),
  ...cambios,
});

describe('decidirCierre', () => {
  it('sin cierre, cierra', () => {
    expect(decidirCierre(null, 'planilla-1')).toBe('CERRAR');
  });

  it('reabierto (por esta u otra planilla), vuelve a cerrar', () => {
    expect(decidirCierre(cierre({ estado: 'REABIERTO' }), 'planilla-1')).toBe(
      'CERRAR',
    );
    expect(decidirCierre(cierre({ estado: 'REABIERTO' }), 'planilla-2')).toBe(
      'CERRAR',
    );
  });

  it('cerrado por la misma planilla, responde igual', () => {
    expect(decidirCierre(cierre(), 'planilla-1')).toBe('YA_CERRADO');
  });

  it('cerrado por otra planilla, falla', () => {
    expect(decidirCierre(cierre(), 'planilla-2')).toBe('CERRADO_POR_OTRA');
  });
});

describe('decidirReapertura', () => {
  it('cerrado por la misma planilla, reabre', () => {
    expect(decidirReapertura(cierre(), 'planilla-1')).toBe('REABRIR');
  });

  it('sin cierre o ya reabierto, no hay nada que cambiar', () => {
    expect(decidirReapertura(null, 'planilla-1')).toBe('YA_REABIERTO');
    expect(
      decidirReapertura(cierre({ estado: 'REABIERTO' }), 'planilla-1'),
    ).toBe('YA_REABIERTO');
  });

  it('el cierre es de otra planilla, no se toca', () => {
    expect(decidirReapertura(cierre(), 'planilla-2')).toBe('DE_OTRA_PLANILLA');
    expect(
      decidirReapertura(cierre({ estado: 'REABIERTO' }), 'planilla-2'),
    ).toBe('DE_OTRA_PLANILLA');
  });
});

describe('motivoCerradoPorOtra', () => {
  it('lleva el periodo real (docs/mensajes.md)', () => {
    expect(motivoCerradoPorOtra('2026-11')).toBe(
      'Los consumos del periodo 2026-11 ya fueron cerrados por otra planilla',
    );
  });
});
