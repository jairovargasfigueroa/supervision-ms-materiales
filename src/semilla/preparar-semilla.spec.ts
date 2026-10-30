import { calcularEstado } from '../stock/dominio/stock-obra.js';
import { leerDatosSemilla, type DatosSemilla } from './datos-semilla.js';
import json from './materiales.json' with { type: 'json' };
import { prepararSemilla, SemillaInvalidaError } from './preparar-semilla.js';

const D = '2026-10-28';
const OBRA_1 = 'b0000000-0000-4000-8000-000000000001';
const OBRA_2 = 'b0000000-0000-4000-8000-000000000002';
const OBRA_3 = 'b0000000-0000-4000-8000-000000000003';
const id = (n: string) => `f0000000-0000-4000-8000-0000000${n}`;

describe('prepararSemilla (derivados calculados con las reglas del dominio)', () => {
  const datos = () => leerDatosSemilla(structuredClone(json));
  const semilla = prepararSemilla(datos(), D);

  it('periodo = mes de registrado_en en La Paz', () => {
    const porId = new Map(semilla.movimientos.map((m) => [m.id, m]));
    expect(porId.get(id('10001'))?.periodo).toBe('2026-07');
    expect(porId.get(id('10001'))?.registradoEn).toEqual(
      new Date('2026-07-05T14:00:00Z'),
    );
    expect(porId.get(id('10033'))?.periodo).toBe('2026-09');
    expect(porId.get(id('30002'))?.registradoEn).toEqual(
      new Date('2026-10-26T14:00:00Z'),
    );
  });

  it('cerrado solo en los periodos con planilla aprobada (obra 1: jul y ago; obra 2: ago)', () => {
    const cerrados = new Set(
      semilla.movimientos
        .filter((m) => m.cerrado)
        .map((m) => `${m.obraId.at(-1)}:${m.periodo}`),
    );
    expect([...cerrados].sort()).toEqual([
      '1:2026-07',
      '1:2026-08',
      '2:2026-08',
    ]);
    for (const m of semilla.movimientos) {
      expect(m.cerrado).toBe(cerrados.has(`${m.obraId.at(-1)}:${m.periodo}`));
    }
  });

  it('solo la salida 20018 supera el stock', () => {
    expect(
      semilla.movimientos.filter((m) => m.superaStock).map((m) => m.id),
    ).toEqual([id('20018')]);
  });

  it('14 filas de stock: 1 BAJO, 2 JUSTO y 11 OK', () => {
    const estados = semilla.stock.map((s) =>
      calcularEstado(s.cantidad, s.minimo),
    );
    expect(estados.filter((e) => e === 'BAJO')).toHaveLength(1);
    expect(estados.filter((e) => e === 'JUSTO')).toHaveLength(2);
    expect(estados.filter((e) => e === 'OK')).toHaveLength(11);
    const obras = new Set(semilla.stock.map((s) => s.obraId));
    expect(obras).toEqual(new Set([OBRA_1, OBRA_2, OBRA_3]));
  });

  it('stock_obra.actualizado_en = último movimiento; obra_acceso.actualizado_en = D (00:00 en La Paz)', () => {
    const cemento2 = semilla.stock.find(
      (s) =>
        s.obraId === OBRA_2 &&
        s.materialId === 'e0000000-0000-4000-8000-000000000001',
    );
    // 20020, M-1 día 18
    expect(cemento2?.actualizadoEn).toEqual(new Date('2026-09-18T14:00:00Z'));
    for (const obra of semilla.obraAcceso) {
      expect(obra.actualizadoEn).toEqual(new Date('2026-10-28T04:00:00Z'));
    }
  });

  it('cierres con _id por obra y periodo y cerrado_en relativo a D', () => {
    expect(
      semilla.cierres.map((c) => [
        c.obraId,
        c.periodo,
        c.cerradoEn.toISOString(),
      ]),
    ).toEqual([
      [OBRA_1, '2026-07', '2026-09-18T14:00:00.000Z'],
      [OBRA_1, '2026-08', '2026-10-16T14:00:00.000Z'],
      [OBRA_2, '2026-08', '2026-10-08T14:00:00.000Z'],
    ]);
  });

  it('con otra D los periodos se mueven y las cantidades no cambian', () => {
    const otra = prepararSemilla(datos(), '2027-01-20');
    expect(otra.movimientos.find((m) => m.id === id('10001'))?.periodo).toBe(
      '2026-10',
    );
    expect(otra.stock.map((s) => s.cantidad)).toEqual(
      semilla.stock.map((s) => s.cantidad),
    );
    expect(otra.movimientos.filter((m) => m.superaStock)).toHaveLength(1);
  });

  it('ingresos antes que salidas el mismo día, aunque el archivo los traiga al revés', () => {
    const d = datos();
    // 20019 (ingreso de 250) el mismo día que 20018 (salida de 120): ya no supera el stock.
    const ingreso = d.movimientos.find((m) => m.id === id('20019'))!;
    const salida = d.movimientos.find((m) => m.id === id('20018'))!;
    ingreso.registradoEn = 'M-1/10 15:00';
    salida.stock = 215;
    ingreso.stock = 335;
    const preparada = prepararSemilla(d, D);
    const orden = preparada.movimientos.map((m) => m.id);
    expect(orden.indexOf(id('20019'))).toBeLessThan(orden.indexOf(id('20018')));
    expect(preparada.movimientos.filter((m) => m.superaStock)).toHaveLength(0);
  });

  describe('falla si algo no cuadra con el documento', () => {
    const fallar = (cambiar: (d: DatosSemilla) => void) => {
      const d = datos();
      cambiar(d);
      try {
        prepararSemilla(d, D);
      } catch (error) {
        expect(error).toBeInstanceOf(SemillaInvalidaError);
        return (error as SemillaInvalidaError).problemas.join('\n');
      }
      throw new Error('se esperaba SemillaInvalidaError');
    };

    it('cantidad final distinta', () => {
      expect(
        fallar((d) => {
          d.stock[0].cantidadEsperada = 239;
        }),
      ).toContain('la cantidad calculada es 238 y el documento dice 239');
    });

    it('estado distinto (mínimo mal copiado)', () => {
      expect(
        fallar((d) => {
          d.stock[1].minimo = 900; // FIE-12 obra 1: 1.150 con mínimo 900 es OK, no JUSTO
        }),
      ).toContain('el estado calculado es OK y el documento dice JUSTO');
    });

    it('cantidad de un movimiento mal copiada', () => {
      const problemas = fallar((d) => {
        d.movimientos[0].cantidad = 901;
      });
      expect(problemas).toContain(
        'el stock queda en 901 y el documento dice 900',
      );
      expect(problemas).toContain('la cantidad calculada es 239');
    });

    it('material desconocido o desactivado, obra sin acceso, salida sin partida', () => {
      const problemas = fallar((d) => {
        d.movimientos[0].material = 'NO-EXISTE';
        d.movimientos[1].material = 'LAD-18H';
        d.movimientos[2].obraId = 'b0000000-0000-4000-8000-000000000009';
        d.movimientos[4].partidaId = null;
      });
      expect(problemas).toContain(
        'el material NO-EXISTE no está en el catálogo',
      );
      expect(problemas).toContain('el material LAD-18H está desactivado');
      expect(problemas).toContain('no está en obra_acceso');
      expect(problemas).toContain('una salida necesita su partida');
    });

    it('movimientos de un material sin fila en la tabla de stock', () => {
      expect(
        fallar((d) => {
          d.stock = d.stock.filter((s) => s.material !== 'PIE-MAN');
        }),
      ).toContain('no está en la tabla de stock del documento');
    });

    it('id repetido', () => {
      expect(
        fallar((d) => {
          d.movimientos[1].id = d.movimientos[0].id;
        }),
      ).toContain('id repetido');
    });
  });
});
