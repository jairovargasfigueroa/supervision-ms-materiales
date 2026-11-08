import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  type Direccion,
  TAMANO_POR_DEFECTO,
} from '../../../compartido/dominio/paginacion.js';
import {
  ORDENES_MATERIAL,
  type OrdenMaterial,
} from '../../aplicacion/puertos/material.repositorio.js';

/** `"true"` y `"false"` de la consulta a booleano; otro valor queda para que falle la validación. */
const aBooleano = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/**
 * Consulta de `GET /materiales`: `busqueda`, `soloActivos` y paginación (convenciones). El
 * `tamano` mayor a 100 lo rechaza el caso de uso con `400 PAGINACION_INVALIDA`.
 */
export class ListarMaterialesDto {
  @IsOptional()
  @IsString({ message: 'Debe ser texto.' })
  busqueda?: string;

  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean({ message: 'Debe ser true o false.' })
  soloActivos?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Debe ser un número entero.' })
  @Min(1, { message: 'Debe ser 1 o más.' })
  pagina: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Debe ser un número entero.' })
  @Min(1, { message: 'Debe ser 1 o más.' })
  tamano: number = TAMANO_POR_DEFECTO;

  @IsOptional()
  @IsIn(ORDENES_MATERIAL, {
    message: `Debe ser uno de: ${ORDENES_MATERIAL.join(', ')}.`,
  })
  orden: OrdenMaterial = 'codigo';

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'Debe ser asc o desc.' })
  direccion: Direccion = 'asc';
}
