import { MaterialRepositorioMemoria } from '../../../../test/utilidades/material-memoria.js';
import type { DatosMaterial } from '../../dominio/material.js';
import { ActualizarMaterialCasoUso } from './actualizar-material.caso-uso.js';
import { CrearMaterialCasoUso } from './crear-material.caso-uso.js';
import { ListarMaterialesCasoUso } from './listar-materiales.caso-uso.js';

const datos = (cambios: Partial<DatosMaterial> = {}): DatosMaterial => ({
  codigo: 'CEM-IP30',
  nombre: 'Cemento IP-30',
  tipo: 'CEMENTO',
  unidad: 'bolsa',
  unidadPlural: 'bolsas',
  precioReferencial: 62,
  activo: true,
  atributos: [],
  ...cambios,
});

const pagina = {
  pagina: 1,
  tamano: 20,
  orden: 'codigo',
  direccion: 'asc',
} as const;

describe('Casos de uso del catálogo', () => {
  let repositorio: MaterialRepositorioMemoria;
  let crear: CrearMaterialCasoUso;
  let actualizar: ActualizarMaterialCasoUso;
  let listar: ListarMaterialesCasoUso;

  beforeEach(() => {
    repositorio = new MaterialRepositorioMemoria();
    crear = new CrearMaterialCasoUso(repositorio);
    actualizar = new ActualizarMaterialCasoUso(repositorio);
    listar = new ListarMaterialesCasoUso(repositorio);
  });

  describe('CrearMaterialCasoUso', () => {
    it('crea con un UUID, activo por defecto y sin atributos', async () => {
      const { activo: _a, atributos: _b, ...sinOpcionales } = datos();
      const material = await crear.ejecutar(sinOpcionales);
      expect(material.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(material.activo).toBe(true);
      expect(material.atributos).toEqual([]);
      expect(repositorio.materiales.get(material.id)).toBe(material);
    });

    it('guarda el código normalizado', async () => {
      const material = await crear.ejecutar(datos({ codigo: ' cem-ip40 ' }));
      expect(material.codigo).toBe('CEM-IP40');
    });

    it('código repetido (aunque venga en minúsculas) → 409 CODIGO_MATERIAL_REPETIDO', async () => {
      await crear.ejecutar(datos());
      await expect(
        crear.ejecutar(datos({ codigo: 'cem-ip30' })),
      ).rejects.toMatchObject({
        codigo: 'CODIGO_MATERIAL_REPETIDO',
        status: 409,
        message: 'Ya existe un material con el código CEM-IP30',
      });
    });
  });

  describe('ActualizarMaterialCasoUso', () => {
    it('reemplaza los datos y puede desactivar', async () => {
      const { id } = await crear.ejecutar(datos());
      const material = await actualizar.ejecutar(
        id,
        datos({ nombre: 'Cemento IP-30 Fancesa', activo: false }),
      );
      expect(material).toMatchObject({ id, activo: false });
      expect(repositorio.materiales.get(id)?.nombre).toBe(
        'Cemento IP-30 Fancesa',
      );
    });

    it('si no existe → 404 MATERIAL_NO_ENCONTRADO', async () => {
      await expect(
        actualizar.ejecutar('no-existe', datos()),
      ).rejects.toMatchObject({
        codigo: 'MATERIAL_NO_ENCONTRADO',
        status: 404,
      });
    });

    it('con el código de otro → 409 CODIGO_MATERIAL_REPETIDO', async () => {
      await crear.ejecutar(datos());
      const { id } = await crear.ejecutar(datos({ codigo: 'FE-12' }));
      await expect(
        actualizar.ejecutar(id, datos({ codigo: 'CEM-IP30' })),
      ).rejects.toMatchObject({ codigo: 'CODIGO_MATERIAL_REPETIDO' });
    });

    it('conservar su propio código no es repetido', async () => {
      const { id } = await crear.ejecutar(datos());
      await expect(actualizar.ejecutar(id, datos())).resolves.toBeDefined();
    });
  });

  describe('ListarMaterialesCasoUso', () => {
    it('tamano mayor a 100 → 400 PAGINACION_INVALIDA', async () => {
      await expect(
        listar.ejecutar({}, { ...pagina, tamano: 101 }),
      ).rejects.toMatchObject({ codigo: 'PAGINACION_INVALIDA', status: 400 });
      await expect(
        listar.ejecutar({}, { ...pagina, tamano: 100 }),
      ).resolves.toBeDefined();
    });

    it('una búsqueda solo con espacios no filtra', async () => {
      await crear.ejecutar(datos());
      const resultado = await listar.ejecutar({ busqueda: '   ' }, pagina);
      expect(resultado.total).toBe(1);
    });
  });
});
