import { MensajeInvalidoError } from '../../compartido/infraestructura/mensajeria/sobre.js';
import { leerDatosConsumos } from './datos-consumos.js';

const datos = (cambios: Record<string, unknown> = {}) => ({
  planillaId: 'planilla-1',
  obraId: 'obra-1',
  periodo: '2026-11',
  ...cambios,
});

describe('leerDatosConsumos', () => {
  it('lee planillaId, obraId y periodo e ignora campos desconocidos', () => {
    expect(leerDatosConsumos('CerrarConsumos', datos({ otro: 1 }))).toEqual({
      planillaId: 'planilla-1',
      obraId: 'obra-1',
      periodo: '2026-11',
    });
  });

  it.each([
    [{ planillaId: undefined }, 'planillaId'],
    [{ obraId: '' }, 'obraId'],
    [{ periodo: 202611 }, 'periodo'],
  ])('sin %o lanza MensajeInvalidoError', (cambios, campo) => {
    expect(() => leerDatosConsumos('CerrarConsumos', datos(cambios))).toThrow(
      MensajeInvalidoError,
    );
    expect(() => leerDatosConsumos('CerrarConsumos', datos(cambios))).toThrow(
      `CerrarConsumos con datos incompletos: falta ${campo}.`,
    );
  });

  it.each(['2026-13', '2026-1', 'noviembre'])(
    'un periodo %s que no es AAAA-MM lanza MensajeInvalidoError',
    (periodo) => {
      expect(() =>
        leerDatosConsumos('ReabrirConsumos', datos({ periodo })),
      ).toThrow(MensajeInvalidoError);
    },
  );
});
