import { MaterialRepositorioMemoria } from '../../../../test/utilidades/material-memoria.js';
import { ObraAccesoRepositorioMemoria } from '../../../../test/utilidades/obra-acceso-memoria.js';
import { StockRepositorioMemoria } from '../../../../test/utilidades/stock-memoria.js';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import { ObraAcceso } from '../../../acceso-obra/dominio/obra-acceso.js';
import { Material } from '../../../catalogo/dominio/material.js';
import { ReglaNegocioError } from '../../../compartido/dominio/regla-negocio.error.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import { ConsultarStockObrasCasoUso } from './consultar-stock-obras.caso-uso.js';

const agente: UsuarioAutenticado = {
  id: 'sa-ia-agentes',
  roles: ['agente_ia'],
  azp: 'ia-agentes',
};
const TODOS = ['BAJO', 'JUSTO', 'OK'] as const;

const obra = (id: string, nombre: string, residenteId = 'res-1') =>
  new ObraAcceso(
    id,
    nombre,
    {
      residenteId,
      maestroId: 'mae',
      almaceneroId: 'alm',
      clienteId: 'cli',
    },
    new Date(),
  );

const material = (id: string, codigo: string) =>
  new Material(id, {
    codigo,
    nombre: 'Material ' + codigo,
    tipo: 'OTRO',
    unidad: 'u',
    unidadPlural: 'u',
    precioReferencial: 1,
    activo: true,
    atributos: [],
  });

describe('ConsultarStockObrasCasoUso (stock_obra, 501)', () => {
  let obras: ObraAccesoRepositorioMemoria;
  let stock: StockRepositorioMemoria;
  let consultar: ConsultarStockObrasCasoUso;

  beforeEach(async () => {
    obras = new ObraAccesoRepositorioMemoria();
    const materiales = new MaterialRepositorioMemoria();
    stock = new StockRepositorioMemoria();
    consultar = new ConsultarStockObrasCasoUso(
      new AccesoObraServicio(obras),
      stock,
      materiales,
    );
    await obras.guardar(obra('o-palmas', 'Edificio Las Palmas'));
    await obras.guardar(obra('o-casa', 'Casa Equipetrol', 'res-2'));
    await materiales.crear(material('m-cem', 'CEM-IP30'));
    await materiales.crear(material('m-are', 'ARE-FINA'));
    // Las Palmas: cemento BAJO (80 < 100), arena OK (50 > 1,25 × 10)
    stock.poner('o-palmas', 'm-cem', 80, 100);
    stock.poner('o-palmas', 'm-are', 50, 10);
    // Equipetrol: cemento JUSTO (110 ≤ 125), arena BAJO
    stock.poner('o-casa', 'm-cem', 110, 100);
    stock.poner('o-casa', 'm-are', 1, 10);
  });

  it('sin obraId: todas las obras, BAJO → JUSTO → OK y luego nombre de obra', async () => {
    const resultado = await consultar.ejecutar(
      { estados: TODOS, limite: 100 },
      agente,
    );
    expect(
      resultado.filas.map((f) => [
        f.obraNombre,
        f.material.codigo,
        f.stock.estado,
      ]),
    ).toEqual([
      ['Casa Equipetrol', 'ARE-FINA', 'BAJO'],
      ['Edificio Las Palmas', 'CEM-IP30', 'BAJO'],
      ['Casa Equipetrol', 'CEM-IP30', 'JUSTO'],
      ['Edificio Las Palmas', 'ARE-FINA', 'OK'],
    ]);
    expect(resultado).toMatchObject({ total: 4, truncado: false });
  });

  it('filtra por estados y por obra', async () => {
    const resultado = await consultar.ejecutar(
      { obraId: 'o-palmas', estados: ['BAJO', 'JUSTO'], limite: 100 },
      agente,
    );
    expect(resultado.filas.map((f) => f.material.codigo)).toEqual(['CEM-IP30']);
    expect(resultado.total).toBe(1);
  });

  it('recorta a limite: total cuenta todas y truncado es true', async () => {
    const resultado = await consultar.ejecutar(
      { estados: TODOS, limite: 3 },
      agente,
    );
    expect(resultado.filas).toHaveLength(3);
    expect(resultado).toMatchObject({ total: 4, truncado: true });
  });

  it('una obra que no está en obra_acceso es OBRA_NO_ENCONTRADA', async () => {
    await expect(
      consultar.ejecutar(
        { obraId: 'no-existe', estados: TODOS, limite: 100 },
        agente,
      ),
    ).rejects.toMatchObject(
      new ReglaNegocioError('OBRA_NO_ENCONTRADA', 'Obra no encontrada', 404),
    );
  });

  it('un residente solo ve sus obras (la regla de visibilidad es la misma)', async () => {
    const resultado = await consultar.ejecutar(
      { estados: TODOS, limite: 100 },
      { id: 'res-2', roles: ['residente'], azp: 'erp' },
    );
    expect(new Set(resultado.filas.map((f) => f.obraNombre))).toEqual(
      new Set(['Casa Equipetrol']),
    );
  });
});
