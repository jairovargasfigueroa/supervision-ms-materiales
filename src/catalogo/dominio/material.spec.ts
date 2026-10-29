import { redondearCantidad } from '../../compartido/dominio/cantidad.js';
import { type DatosMaterial, Material, normalizarCodigo } from './material.js';

const datos = (cambios: Partial<DatosMaterial> = {}): DatosMaterial => ({
  codigo: 'CEM-IP30',
  nombre: 'Cemento IP-30',
  tipo: 'CEMENTO',
  unidad: 'bolsa',
  unidadPlural: 'bolsas',
  precioReferencial: 62,
  activo: true,
  atributos: [{ nombre: 'peso', valor: '50 kg' }],
  ...cambios,
});

describe('Material', () => {
  it('normaliza el código a mayúsculas sin espacios a los costados', () => {
    expect(normalizarCodigo('  cem-ip30 ')).toBe('CEM-IP30');
    expect(new Material('m1', datos({ codigo: ' fe-12mm ' })).codigo).toBe(
      'FE-12MM',
    );
  });

  it('quita los espacios a los costados del nombre, las unidades y los atributos', () => {
    const material = new Material(
      'm1',
      datos({
        nombre: ' Cemento IP-30 ',
        unidad: ' bolsa',
        unidadPlural: 'bolsas ',
        atributos: [{ nombre: ' peso ', valor: ' 50 kg ' }],
      }),
    );
    expect(material).toMatchObject({
      nombre: 'Cemento IP-30',
      unidad: 'bolsa',
      unidadPlural: 'bolsas',
      atributos: [{ nombre: 'peso', valor: '50 kg' }],
    });
  });

  it('conDatos reemplaza todo y conserva el id', () => {
    const material = new Material('m1', datos());
    const cambiado = material.conDatos(datos({ activo: false, codigo: 'x' }));
    expect(cambiado.id).toBe('m1');
    expect(cambiado.activo).toBe(false);
    expect(cambiado.codigo).toBe('X');
  });
});

describe('redondearCantidad', () => {
  it('redondea a 3 decimales, mitad hacia arriba', () => {
    expect(redondearCantidad(1.0005)).toBe(1.001);
    expect(redondearCantidad(1.0004)).toBe(1);
    expect(redondearCantidad(0.1 + 0.2)).toBe(0.3);
  });
});
