import { DatosSemillaError, leerDatosSemilla } from './datos-semilla.js';
import json from './materiales.json' with { type: 'json' };

describe('materiales.json (docs/datos-prueba.md, secciones 5, 6 y 9)', () => {
  const datos = leerDatosSemilla(json);

  it('trae 15 materiales, 3 obra_acceso, 14 mínimos, 67 movimientos y 3 cierres', () => {
    expect(datos.materiales).toHaveLength(15);
    expect(datos.obraAcceso).toHaveLength(3);
    expect(datos.stock).toHaveLength(14);
    expect(datos.movimientos).toHaveLength(67);
    expect(datos.cierres).toHaveLength(3);
  });

  it('ids sin repetir y con el patrón de la sección 2', () => {
    const unicos = (ids: string[]) => new Set(ids).size === ids.length;
    expect(unicos(datos.materiales.map((m) => m.id))).toBe(true);
    expect(unicos(datos.materiales.map((m) => m.codigo))).toBe(true);
    expect(unicos(datos.movimientos.map((m) => m.id))).toBe(true);
    for (const m of datos.materiales) {
      expect(m.id).toMatch(
        /^e0000000-0000-4000-8000-0000000000(0[1-9]|1[0-5])$/,
      );
    }
    for (const m of datos.movimientos) {
      expect(m.id).toMatch(/^f0000000-0000-4000-8000-0000000[123]\d{4}$/);
      // el primer dígito del N.º es la obra
      expect(m.obraId.at(-1)).toBe(m.id.at(-5));
    }
  });

  it('un material inactivo (LAD-18H) y uno sin proveedor habitual (TUB-PVC4)', () => {
    expect(
      datos.materiales.filter((m) => !m.activo).map((m) => m.codigo),
    ).toEqual(['LAD-18H']);
    expect(
      datos.materiales
        .filter((m) => m.proveedorHabitualId === null)
        .map((m) => m.codigo),
    ).toEqual(['TUB-PVC4']);
  });

  it('ingresos con nota de remisión y sin partida; salidas con partida de su obra', () => {
    for (const m of datos.movimientos) {
      if (m.tipo === 'INGRESO') {
        expect(m.partidaId).toBeNull();
        expect(m.notaRemision).toBe(`NR-${m.id.slice(-5)}`);
      } else {
        expect(m.notaRemision).toBeNull();
        // b1000000-…-000000000OPP: la O es la obra del movimiento
        expect(m.partidaId?.at(-3)).toBe(m.obraId.at(-1));
      }
    }
  });

  it('rechaza un archivo con otra forma', () => {
    expect(() => leerDatosSemilla(null)).toThrow(DatosSemillaError);
    expect(() => leerDatosSemilla({ ...json, materiales: {} })).toThrow(
      'raíz.materiales: se esperaba una lista',
    );
    const movimientos = structuredClone(json.movimientos);
    (movimientos[0] as { tipo: string }).tipo = 'AJUSTE';
    expect(() => leerDatosSemilla({ ...json, movimientos })).toThrow(
      'movimientos[0].tipo',
    );
    const materiales = structuredClone(json.materiales);
    (materiales[0] as { id: string }).id = 'cemento';
    expect(() => leerDatosSemilla({ ...json, materiales })).toThrow(
      '«cemento» no es un UUID',
    );
  });
});
