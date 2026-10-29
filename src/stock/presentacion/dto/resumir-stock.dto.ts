import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
} from 'class-validator';

/** Máximo de obras por consulta de `GET /stock/resumen` (el gateway pide en lotes de hasta 100). */
export const MAXIMO_OBRAS_RESUMEN = 100;

/**
 * `"a,b,c"` (o el parámetro repetido) a una lista de ids sin espacios a los costados ni vacíos.
 * Otro tipo de valor queda igual, para que falle la validación.
 */
const aLista = ({ value }: { value: unknown }): unknown => {
  const partes = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(partes) || !partes.every((p) => typeof p === 'string')) {
    return value;
  }
  return partes
    .flatMap((parte: string) => parte.split(','))
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
};

/** Consulta de `GET /stock/resumen`: `obraIds` obligatorio, de 1 a 100 ids separados por coma. */
export class ResumirStockDto {
  @Transform(aLista)
  @IsArray({ message: 'Debe ser una lista de ids separados por coma.' })
  @ArrayNotEmpty({ message: 'Es obligatorio: al menos un id de obra.' })
  @ArrayMaxSize(MAXIMO_OBRAS_RESUMEN, {
    message: `Debe tener hasta ${MAXIMO_OBRAS_RESUMEN} obras.`,
  })
  @IsString({ each: true, message: 'Cada id debe ser texto.' })
  // Sin el parámetro queda vacío: solo falla `ArrayNotEmpty`, con un único mensaje.
  obraIds: string[] = [];
}
