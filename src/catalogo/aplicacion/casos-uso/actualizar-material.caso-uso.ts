import { Inject, Injectable } from '@nestjs/common';
import {
  type DatosMaterial,
  type Material,
  materialNoEncontrado,
} from '../../dominio/material.js';
import {
  MATERIAL_REPOSITORIO,
  type MaterialRepositorio,
} from '../puertos/material.repositorio.js';

/**
 * `PUT /materiales/{id}` (003): reemplaza todos los datos del material, también `activo`
 * (desactivar no borra). Si no existe, `404 MATERIAL_NO_ENCONTRADO`.
 */
@Injectable()
export class ActualizarMaterialCasoUso {
  constructor(
    @Inject(MATERIAL_REPOSITORIO)
    private readonly materiales: MaterialRepositorio,
  ) {}

  async ejecutar(id: string, datos: DatosMaterial): Promise<Material> {
    const actual = await this.materiales.buscar(id);
    if (!actual) throw materialNoEncontrado();
    const material = actual.conDatos(datos);
    await this.materiales.guardar(material);
    return material;
  }
}
