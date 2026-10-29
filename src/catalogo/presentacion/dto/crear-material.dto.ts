import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CODIGO_LARGO_MAXIMO,
  NOMBRE_LARGO_MAXIMO,
} from '../../dominio/material.js';
import {
  TIPOS_MATERIAL,
  type TipoMaterial,
} from '../../dominio/tipo-material.js';

/** Quita los espacios a los costados antes de validar el largo. */
const recortar = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const TEXTO = { message: 'Debe ser texto.' };
const OBLIGATORIO = { message: 'Es obligatorio.' };

export class AtributoDto {
  @Transform(recortar)
  @IsString(TEXTO)
  @IsNotEmpty(OBLIGATORIO)
  nombre: string;

  @Transform(recortar)
  @IsString(TEXTO)
  @IsNotEmpty(OBLIGATORIO)
  valor: string;
}

/** Campos comunes de `POST /materiales` y `PUT /materiales/{id}` (003, criterio 3). */
export abstract class DatosMaterialDto {
  @Transform(recortar)
  @IsString(TEXTO)
  @IsNotEmpty(OBLIGATORIO)
  @MaxLength(CODIGO_LARGO_MAXIMO, {
    message: `Debe tener hasta ${CODIGO_LARGO_MAXIMO} caracteres.`,
  })
  codigo: string;

  @Transform(recortar)
  @IsString(TEXTO)
  @IsNotEmpty(OBLIGATORIO)
  @MaxLength(NOMBRE_LARGO_MAXIMO, {
    message: `Debe tener hasta ${NOMBRE_LARGO_MAXIMO} caracteres.`,
  })
  nombre: string;

  @IsIn(TIPOS_MATERIAL, {
    message: `Debe ser uno de: ${TIPOS_MATERIAL.join(', ')}.`,
  })
  tipo: TipoMaterial;

  @Transform(recortar)
  @IsString(TEXTO)
  @IsNotEmpty(OBLIGATORIO)
  unidad: string;

  @Transform(recortar)
  @IsString(TEXTO)
  @IsNotEmpty(OBLIGATORIO)
  unidadPlural: string;

  /** En bolivianos, con hasta 2 decimales (convenciones, «Montos»). */
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'Debe ser un número con hasta 2 decimales.' },
  )
  @Min(0, { message: 'No puede ser negativo.' })
  precioReferencial: number;

  @IsOptional()
  @IsArray({ message: 'Debe ser una lista de { nombre, valor }.' })
  @ValidateNested({ each: true })
  @Type(() => AtributoDto)
  atributos?: AtributoDto[];
}

/** `POST /materiales`: sin `id`; `activo` por defecto `true`. */
export class CrearMaterialDto extends DatosMaterialDto {
  @IsOptional()
  @IsBoolean({ message: 'Debe ser verdadero o falso.' })
  activo?: boolean;
}
