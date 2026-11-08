import { Inject, Injectable } from '@nestjs/common';
import {
  type CriteriosPagina,
  type Pagina,
  validarPaginacion,
} from '../../../compartido/dominio/paginacion.js';
import type { Material } from '../../dominio/material.js';
import {
  type FiltroMateriales,
  MATERIAL_REPOSITORIO,
  type MaterialRepositorio,
  type OrdenMaterial,
} from '../puertos/material.repositorio.js';

/**
 * `GET /materiales` (002, 003, 006): búsqueda por código o nombre, solo activos si se pide, y
 * paginado (`tamano` mayor a 100 → `400 PAGINACION_INVALIDA`).
 */
@Injectable()
export class ListarMaterialesCasoUso {
  constructor(
    @Inject(MATERIAL_REPOSITORIO)
    private readonly materiales: MaterialRepositorio,
  ) {}

  async ejecutar(
    filtro: FiltroMateriales,
    criterios: CriteriosPagina<OrdenMaterial>,
  ): Promise<Pagina<Material>> {
    validarPaginacion(criterios);
    const busqueda = filtro.busqueda?.trim();
    return this.materiales.listar(
      { ...filtro, busqueda: busqueda ? busqueda : undefined },
      criterios,
    );
  }
}
