import { IsNumber, Min } from 'class-validator';

/** `PUT /obras/{obraId}/stock/{materialId}/minimo`: `{ "minimo": 100 }` (≥ 0, hasta 3 decimales). */
export class FijarMinimoDto {
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 },
    { message: 'Debe ser un número con hasta 3 decimales.' },
  )
  @Min(0, { message: 'No puede ser negativo.' })
  minimo: number;
}
