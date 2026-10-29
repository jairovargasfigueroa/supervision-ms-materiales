import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  ValidateBy,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  TIPOS_MOVIMIENTO,
  type TipoMovimiento,
} from '../../dominio/movimiento.js';

/** El campo solo puede venir en movimientos de ese tipo (vacío o nulo, en cualquiera). */
function SoloEn(tipo: TipoMovimiento, mensaje: string): PropertyDecorator {
  return ValidateBy({
    name: 'soloEn',
    validator: {
      validate: (valor, argumentos) =>
        valor == null ||
        (argumentos?.object as { tipo?: unknown } | undefined)?.tipo === tipo,
      defaultMessage: () => mensaje,
    },
  });
}

/** `notaRemision` de un ingreso: `{ "numero": "NR-00123" }`. */
export class NotaRemisionDto {
  @IsString({ message: 'Debe ser texto.' })
  @Matches(/\S/, { message: 'No puede estar vacío.' })
  numero: string;
}

/**
 * Cuerpo de `POST /movimientos` (`docs/contratos.md`). `partidaId` es obligatorio en `SALIDA` y
 * no va en `INGRESO`; `notaRemision` solo va en `INGRESO` y es opcional.
 */
export class RegistrarMovimientoDto {
  @IsUUID('4', { message: 'Debe ser un UUID v4.' })
  id: string;

  @IsUUID('all', { message: 'Debe ser un UUID.' })
  obraId: string;

  @IsString({ message: 'Debe ser texto.' })
  @IsNotEmpty({ message: 'Es obligatorio.' })
  materialId: string;

  @IsIn(TIPOS_MOVIMIENTO, { message: 'Debe ser INGRESO o SALIDA.' })
  tipo: TipoMovimiento;

  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 },
    { message: 'Debe ser un número con hasta 3 decimales.' },
  )
  @IsPositive({ message: 'Debe ser mayor que 0.' })
  cantidad: number;

  /** Obligatoria en salidas; en ingresos no se envía. */
  @ValidateIf(
    (dto: RegistrarMovimientoDto) =>
      dto.tipo === 'SALIDA' || dto.partidaId != null,
  )
  @SoloEn('SALIDA', 'Solo va en salidas.')
  @IsDefined({ message: 'Es obligatoria en salidas.' })
  @IsUUID('all', { message: 'Debe ser un UUID.' })
  partidaId?: string;

  @IsOptional()
  @SoloEn('INGRESO', 'Solo va en ingresos.')
  @IsObject({ message: 'Debe ser un objeto.' })
  @ValidateNested()
  @Type(() => NotaRemisionDto)
  notaRemision?: NotaRemisionDto;

  /** Momento del registro en el celular, en ISO 8601 con zona (`2026-11-15T14:00:00Z`). */
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'Debe ser una fecha ISO 8601.' },
  )
  @Matches(/T.*(Z|[+-]\d{2}:\d{2})$/, {
    message: 'Debe incluir la hora y la zona (por ejemplo, Z).',
  })
  registradoEn: string;
}
