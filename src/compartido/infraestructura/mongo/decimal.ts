import { Types } from 'mongoose';

/**
 * Los `decimal` de `docs/datos.md` se guardan como `Decimal128` (sumas exactas con `$inc`) y en
 * el dominio y el JSON son `number`.
 */
export function aNumero(valor: Types.Decimal128 | null | undefined): number {
  return valor == null ? 0 : Number(valor.toString());
}

export function aDecimal(valor: number): Types.Decimal128 {
  return Types.Decimal128.fromString(String(valor));
}
