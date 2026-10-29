import {
  FechaRelativaError,
  fechaDeCarga,
  instanteEnLaPaz,
  resolver,
  resolverInstante,
  resolverPeriodo,
} from './fecha-relativa.js';

const D = '2026-10-28';

describe('resolver (fechas relativas a D, 011)', () => {
  it('tabla del diseño con D = 2026-10-28', () => {
    expect(resolver('D-120', D)).toEqual({
      tipo: 'fecha',
      valor: '2026-06-30',
    });
    expect(resolver('D+18', D)).toEqual({ tipo: 'fecha', valor: '2026-11-15' });
    expect(resolver('M-3', D)).toEqual({ tipo: 'periodo', valor: '2026-07' });
    expect(resolver('M-1/09 10:00', D)).toEqual({
      tipo: 'instante',
      valor: new Date('2026-09-09T14:00:00Z'),
    });
    expect(resolver('D-2 11:00', D)).toEqual({
      tipo: 'instante',
      valor: new Date('2026-10-26T15:00:00Z'),
    });
  });

  it.each([
    ['D', '2026-10-28'],
    ['D-0', '2026-10-28'],
    ['D+4', '2026-11-01'],
    ['D-28', '2026-09-30'],
  ])('%s → %s', (expresion, valor) => {
    expect(resolver(expresion, D)).toEqual({ tipo: 'fecha', valor });
  });

  it.each([
    ['M0', '2026-10'],
    ['M+2', '2026-12'],
    ['M+3', '2027-01'],
    ['M-10', '2025-12'],
    ['M-12', '2025-10'],
  ])('%s → %s (cruza de año)', (expresion, valor) => {
    expect(resolver(expresion, D)).toEqual({ tipo: 'periodo', valor });
  });

  it('M-k/dd sin hora es a las 10:00 de La Paz', () => {
    expect(resolverInstante('M-3/05', D)).toEqual(
      new Date('2026-07-05T14:00:00Z'),
    );
  });

  it('D±n con hora cruza de mes y de año', () => {
    expect(resolverInstante('D-40 10:00', D)).toEqual(
      new Date('2026-09-18T14:00:00Z'),
    );
    expect(resolverInstante('D-3 10:00', '2027-01-02')).toEqual(
      new Date('2026-12-30T14:00:00Z'),
    );
    // 22:30 en La Paz ya es el día siguiente en UTC
    expect(resolverInstante('D 22:30', D)).toEqual(
      new Date('2026-10-29T02:30:00Z'),
    );
  });

  it('M-k/dd cae siempre en el periodo M-k', () => {
    expect(resolverInstante('M-1/02 10:00', '2026-03-31')).toEqual(
      new Date('2026-02-02T14:00:00Z'),
    );
    expect(resolverInstante('M-1/27 10:00', '2026-03-31')).toEqual(
      new Date('2026-02-27T14:00:00Z'),
    );
  });

  it.each([
    'D -2',
    'D-2,11:00',
    'D-2 1:00',
    'D-2 24:00',
    'D-2 10:60',
    'M-1/9 10:00',
    'M-1/01 10:00',
    'M-1/28 10:00',
    'M-1/31',
    'M+0',
    'M-0',
    'M',
    'X-1',
    '',
    '2026-10-28',
  ])('«%s» es un error', (expresion) => {
    expect(() => resolver(expresion, D)).toThrow(FechaRelativaError);
  });

  it('resolverInstante y resolverPeriodo exigen su tipo', () => {
    expect(() => resolverInstante('D-2', D)).toThrow(FechaRelativaError);
    expect(() => resolverInstante('M-1', D)).toThrow(FechaRelativaError);
    expect(resolverPeriodo('M-2', D)).toBe('2026-08');
    expect(() => resolverPeriodo('M-1/09 10:00', D)).toThrow(
      FechaRelativaError,
    );
    expect(() => resolverPeriodo('D', D)).toThrow(FechaRelativaError);
  });

  it.each(['2026-13-01', '2026-02-30', '28/10/2026', '2026-10-28T00:00'])(
    'D mal formada o inexistente («%s») es un error',
    (d) => {
      expect(() => resolver('D', d)).toThrow(FechaRelativaError);
    },
  );
});

describe('fechaDeCarga', () => {
  it('usa SEMILLA_FECHA si viene', () => {
    expect(fechaDeCarga('2026-10-28')).toBe('2026-10-28');
    expect(fechaDeCarga(' 2027-01-20 ')).toBe('2027-01-20');
  });

  it('sin SEMILLA_FECHA, es hoy en America/La_Paz', () => {
    // 29 de octubre 03:00 UTC = 28 de octubre 23:00 en La Paz
    expect(fechaDeCarga(undefined, new Date('2026-10-29T03:00:00Z'))).toBe(
      '2026-10-28',
    );
    expect(fechaDeCarga('', new Date('2026-10-29T04:00:00Z'))).toBe(
      '2026-10-29',
    );
  });

  it('SEMILLA_FECHA mal formada es un error', () => {
    expect(() => fechaDeCarga('2026-10-32')).toThrow(FechaRelativaError);
    expect(() => fechaDeCarga('hoy')).toThrow(FechaRelativaError);
  });
});

describe('instanteEnLaPaz', () => {
  it('La Paz es UTC−4', () => {
    expect(instanteEnLaPaz(2026, 10, 28)).toEqual(
      new Date('2026-10-28T04:00:00Z'),
    );
    expect(instanteEnLaPaz(2026, 12, 31, 23, 59)).toEqual(
      new Date('2027-01-01T03:59:00Z'),
    );
  });
});
