/**
 * Cantidades de material: se guardan con 3 decimales (convenciones, «Nombres»). Para comparar sin
 * errores de coma flotante, se pasan a milésimas enteras.
 */
export const DECIMALES_CANTIDAD = 3;

/** La cantidad en milésimas enteras (redondeo «mitad hacia arriba»). */
export function aMilesimas(cantidad: number): number {
  return redondearMitadArriba(cantidad * 10 ** DECIMALES_CANTIDAD);
}

/** La cantidad redondeada a 3 decimales («mitad hacia arriba»). */
export function redondearCantidad(cantidad: number): number {
  return aMilesimas(cantidad) / 10 ** DECIMALES_CANTIDAD;
}

/**
 * Redondeo «mitad hacia arriba» (hacia +∞ en el 0,5) de un valor que debería ser casi entero.
 * Se corrige antes el error de representación (por ejemplo 1,0005 × 1000 = 1000,4999…).
 */
function redondearMitadArriba(valor: number): number {
  return Math.floor(Number(valor.toPrecision(15)) + 0.5);
}

/** Suma exacta de dos cantidades (en milésimas enteras), con 3 decimales. */
export function sumarCantidades(a: number, b: number): number {
  return (aMilesimas(a) + aMilesimas(b)) / 10 ** DECIMALES_CANTIDAD;
}
