import { calcularEstado, cruzaAlBajo, StockObra } from './stock-obra.js';

const stock = (cantidad: number, minimo: number) =>
  new StockObra('obra-1', 'material-1', cantidad, minimo, 1, new Date());

describe('calcularEstado (reglas del negocio, «Material y stock»)', () => {
  it.each([
    // cantidad, mínimo, estado
    [99, 100, 'BAJO'],
    [99.999, 100, 'BAJO'],
    [100, 100, 'JUSTO'], // igual al mínimo
    [120, 100, 'JUSTO'],
    [125, 100, 'JUSTO'], // 1,25 × mínimo
    [125.001, 100, 'OK'], // por encima de 1,25 × mínimo
    [500, 100, 'OK'],
    [-5, 100, 'BAJO'], // una salida que superó el stock
  ] as const)('%d con mínimo %d → %s', (cantidad, minimo, estado) => {
    expect(calcularEstado(cantidad, minimo)).toBe(estado);
  });

  it('compara sin errores de coma flotante (0,125 = 1,25 × 0,1 es JUSTO)', () => {
    expect(calcularEstado(0.1, 0.1)).toBe('JUSTO');
    expect(calcularEstado(0.125, 0.1)).toBe('JUSTO');
    expect(calcularEstado(0.126, 0.1)).toBe('OK');
    expect(calcularEstado(0.099, 0.1)).toBe('BAJO');
  });

  it('con mínimo 0: cantidad 0 es JUSTO, más es OK y negativa es BAJO', () => {
    expect(calcularEstado(0, 0)).toBe('JUSTO');
    expect(calcularEstado(1, 0)).toBe('OK');
    expect(calcularEstado(-1, 0)).toBe('BAJO');
  });

  it('StockObra calcula su estado al leer', () => {
    expect(stock(10, 100).estado).toBe('BAJO');
    expect(stock(110, 100).estado).toBe('JUSTO');
    expect(stock(200, 100).estado).toBe('OK');
  });
});

describe('cruzaAlBajo', () => {
  it('avisa cuando pasa a BAJO desde JUSTO u OK', () => {
    expect(cruzaAlBajo(stock(100, 100), stock(100, 150))).toBe(true);
    expect(cruzaAlBajo(stock(200, 100), stock(200, 250))).toBe(true);
  });

  it('avisa cuando no había fila y queda BAJO (mínimo nuevo sobre cantidad 0)', () => {
    expect(cruzaAlBajo(null, stock(0, 50))).toBe(true);
  });

  it('no avisa si ya estaba BAJO', () => {
    expect(cruzaAlBajo(stock(10, 100), stock(10, 200))).toBe(false);
  });

  it('no avisa si no queda BAJO', () => {
    expect(cruzaAlBajo(stock(10, 100), stock(10, 5))).toBe(false);
    expect(cruzaAlBajo(null, stock(0, 0))).toBe(false);
  });
});
