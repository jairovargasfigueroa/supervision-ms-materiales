import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type DatosMaterial, Material } from '../../dominio/material.js';
import {
  MATERIAL_REPOSITORIO,
  type MaterialRepositorio,
} from '../puertos/material.repositorio.js';

/** Datos para crear: `activo` por defecto `true` y `atributos` por defecto vacíos. */
export type NuevoMaterial = Omit<DatosMaterial, 'activo' | 'atributos'> &
  Partial<Pick<DatosMaterial, 'activo' | 'atributos'>>;

/** `POST /materiales` (003): crea el material con un UUID nuevo. */
@Injectable()
export class CrearMaterialCasoUso {
  constructor(
    @Inject(MATERIAL_REPOSITORIO)
    private readonly materiales: MaterialRepositorio,
  ) {}

  async ejecutar(datos: NuevoMaterial): Promise<Material> {
    const material = new Material(randomUUID(), {
      ...datos,
      activo: datos.activo ?? true,
      atributos: datos.atributos ?? [],
    });
    await this.materiales.crear(material);
    return material;
  }
}
