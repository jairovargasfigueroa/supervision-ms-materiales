import { ajusteDeStock, periodoCerrado, superaElStock } from './movimiento.js';

describe('Reglas del movimiento', () => {
  it('un ingreso suma y una salida resta', () => {
    expect(ajusteDeStock('INGRESO', 12.5)).toBe(12.5);
    expect(ajusteDeStock('SALIDA', 12.5)).toBe(-12.5);
  });

  it.each([
    ['SALIDA', 10, 10, false], // igual al stock: no lo supera
    ['SALIDA', 10.001, 10, true],
    ['SALIDA', 1, 0, true],
    ['SALIDA', 1, -5, true], // ya negativo
    ['SALIDA', 0.3, 0.30000000000000004, false], // sin errores de coma flotante
    ['INGRESO', 100, 0, false], // un ingreso nunca lo supera
  ] as const)(
    '%s de %d con stock %d → superaStock %s',
    (tipo, cantidad, previo, esperado) => {
      expect(superaElStock(tipo, cantidad, previo)).toBe(esperado);
    },
  );

  it('PERIODO_CERRADO con el texto de mensajes.md', () => {
    expect(periodoCerrado('2026-11')).toMatchObject({
      codigo: 'PERIODO_CERRADO',
      status: 409,
      message: 'El periodo 2026-11 ya está cerrado',
    });
  });
});
