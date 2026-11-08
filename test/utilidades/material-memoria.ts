import type {
  FiltroMateriales,
  MaterialRepositorio,
  OrdenMaterial,
} from '../../src/catalogo/aplicacion/puertos/material.repositorio.js';
import {
  codigoRepetido,
  type Material,
} from '../../src/catalogo/dominio/material.js';
import type {
  CriteriosPagina,
  Pagina,
} from '../../src/compartido/dominio/paginacion.js';

/** Repositorio de `material` en memoria para las pruebas unitarias (código único). */
export class MaterialRepositorioMemoria implements MaterialRepositorio {
  readonly materiales = new Map<string, Material>();

  crear(material: Material): Promise<void> {
    return this.guardar(material);
  }

  guardar(material: Material): Promise<void> {
    const otro = [...this.materiales.values()].find(
      (m) => m.codigo === material.codigo && m.id !== material.id,
    );
    if (otro) return Promise.reject(codigoRepetido(material.codigo));
    this.materiales.set(material.id, material);
    return Promise.resolve();
  }

  buscar(id: string): Promise<Material | null> {
    return Promise.resolve(this.materiales.get(id) ?? null);
  }

  buscarVarios(ids: readonly string[]): Promise<Material[]> {
    return Promise.resolve(
      ids.flatMap((id) => {
        const material = this.materiales.get(id);
        return material ? [material] : [];
      }),
    );
  }

  listar(
    filtro: FiltroMateriales,
    criterios: CriteriosPagina<OrdenMaterial>,
  ): Promise<Pagina<Material>> {
    const busqueda = filtro.busqueda?.toLowerCase();
    const todos = [...this.materiales.values()]
      .filter((m) => !filtro.soloActivos || m.activo)
      .filter(
        (m) =>
          !busqueda ||
          m.codigo.toLowerCase().includes(busqueda) ||
          m.nombre.toLowerCase().includes(busqueda),
      )
      .sort((a, b) => {
        const orden = String(a[criterios.orden]).localeCompare(
          String(b[criterios.orden]),
        );
        return criterios.direccion === 'desc' ? -orden : orden;
      });
    const inicio = (criterios.pagina - 1) * criterios.tamano;
    return Promise.resolve({
      items: todos.slice(inicio, inicio + criterios.tamano),
      total: todos.length,
      pagina: criterios.pagina,
      tamano: criterios.tamano,
    });
  }
}
