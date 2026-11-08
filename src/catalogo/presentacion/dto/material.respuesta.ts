import type { Pagina } from '../../../compartido/dominio/paginacion.js';
import type { Atributo, Material } from '../../dominio/material.js';
import type { TipoMaterial } from '../../dominio/tipo-material.js';

/** Material en el JSON de `GET/POST/PUT /materiales` (`docs/contratos.md`). */
export class MaterialRespuesta {
  id: string;
  codigo: string;
  nombre: string;
  tipo: TipoMaterial;
  unidad: string;
  unidadPlural: string;
  precioReferencial: number;
  activo: boolean;
  atributos: Atributo[];

  static desde(material: Material): MaterialRespuesta {
    return Object.assign(new MaterialRespuesta(), {
      id: material.id,
      codigo: material.codigo,
      nombre: material.nombre,
      tipo: material.tipo,
      unidad: material.unidad,
      unidadPlural: material.unidadPlural,
      precioReferencial: material.precioReferencial,
      activo: material.activo,
      atributos: material.atributos.map(({ nombre, valor }) => ({
        nombre,
        valor,
      })),
    });
  }

  static pagina(pagina: Pagina<Material>): Pagina<MaterialRespuesta> {
    return { ...pagina, items: pagina.items.map(MaterialRespuesta.desde) };
  }
}
