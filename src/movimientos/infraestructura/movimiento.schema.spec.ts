import {
  CierrePeriodoSchema,
  idCierrePeriodo,
} from '../../cierres/infraestructura/cierre-periodo.schema.js';
import { MovimientoSchema } from './movimiento.schema.js';

describe('Esquemas de movimiento y cierre_periodo (docs/datos.md)', () => {
  it('movimiento tiene los índices previstos', () => {
    expect(MovimientoSchema.indexes()).toEqual([
      [
        { obra_id: 1, periodo: 1 },
        expect.objectContaining({ name: 'por_obra_periodo' }),
      ],
      [
        { obra_id: 1, material_id: 1 },
        expect.objectContaining({ name: 'por_obra_material' }),
      ],
      [
        { obra_id: 1, partida_id: 1, periodo: 1 },
        expect.objectContaining({ name: 'por_obra_partida_periodo' }),
      ],
    ]);
  });

  it('movimiento guarda supera_stock y cerrado (por defecto false)', () => {
    for (const campo of ['supera_stock', 'cerrado']) {
      const ruta = MovimientoSchema.path(campo);
      expect(ruta.instance).toBe('Boolean');
      expect(ruta.options.default).toBe(false);
    }
    expect(MovimientoSchema.path('tipo').options.enum).toEqual([
      'INGRESO',
      'SALIDA',
    ]);
  });

  it('cierre_periodo: uno por obra y periodo, CERRADO o REABIERTO', () => {
    expect(idCierrePeriodo('obra-1', '2026-11')).toBe('obra-1:2026-11');
    expect(CierrePeriodoSchema.path('estado').options.enum).toEqual([
      'CERRADO',
      'REABIERTO',
    ]);
  });
});
