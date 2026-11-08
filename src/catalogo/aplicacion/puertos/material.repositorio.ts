import type {
  CriteriosPagina,
  Pagina,
} from '../../../compartido/dominio/paginacion.js';
import type { Material } from '../../dominio/material.js';

export const MATERIAL_REPOSITORIO = Symbol('MATERIAL_REPOSITORIO');

/** Campos por los que se puede ordenar `GET /materiales` (por defecto `codigo`). */
export const ORDENES_MATERIAL = [
  'codigo',
  'nombre',
  'tipo',
  'precioReferencial',
] as const;
export type OrdenMaterial = (typeof ORDENES_MATERIAL)[number];

export interface FiltroMateriales {
  /** Parte del código o del nombre, sin distinguir mayúsculas. */
  busqueda?: string;
  soloActivos?: boolean;
}

export interface MaterialRepositorio {
  /** Si el código ya existe, `409 CODIGO_MATERIAL_REPETIDO`. */
  crear(material: Material): Promise<void>;
  /** Reemplaza el material (ya existe). Si el código es de otro, `409 CODIGO_MATERIAL_REPETIDO`. */
  guardar(material: Material): Promise<void>;
  buscar(id: string): Promise<Material | null>;
  /** Los materiales de esa lista que existan (en cualquier orden). */
  buscarVarios(ids: readonly string[]): Promise<Material[]>;
  listar(
    filtro: FiltroMateriales,
    criterios: CriteriosPagina<OrdenMaterial>,
  ): Promise<Pagina<Material>>;
}
