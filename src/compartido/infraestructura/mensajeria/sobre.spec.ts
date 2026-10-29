import { leerSobre, MensajeInvalidoError } from './sobre.js';

const json = (valor: unknown) => Buffer.from(JSON.stringify(valor));

const sobreValido = {
  id: '7f1c2e3a-0000-4000-8000-000000000001',
  tipo: 'ObraRegistrada',
  version: 1,
  ocurridoEn: '2026-10-29T14:30:00Z',
  origen: 'obras',
  correlacionId: '7f1c2e3a-0000-4000-8000-000000000002',
  datos: { obraId: 'o1' },
};

describe('leerSobre', () => {
  it('devuelve el sobre de un mensaje válido', () => {
    expect(leerSobre(json(sobreValido))).toEqual(sobreValido);
  });

  it('acepta un sobre sin los campos opcionales', () => {
    const { id, tipo, version, datos } = sobreValido;
    expect(leerSobre(json({ id, tipo, version, datos }))).toMatchObject({
      id,
      tipo,
    });
  });

  it.each([
    ['no es JSON', Buffer.from('{no es json')],
    ['es un arreglo', json([sobreValido])],
    ['sin id', json({ ...sobreValido, id: undefined })],
    ['id vacío', json({ ...sobreValido, id: ' ' })],
    ['sin tipo', json({ ...sobreValido, tipo: undefined })],
    ['versión desconocida', json({ ...sobreValido, version: 2 })],
    ['sin datos', json({ ...sobreValido, datos: undefined })],
    ['datos que no son objeto', json({ ...sobreValido, datos: 'x' })],
    ['origen que no es texto', json({ ...sobreValido, origen: 5 })],
  ])('rechaza un mensaje que %s', (_caso, contenido) => {
    expect(() => leerSobre(contenido)).toThrow(MensajeInvalidoError);
  });
});
