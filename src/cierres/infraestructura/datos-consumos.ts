import { FORMATO_PERIODO } from '../../compartido/dominio/periodo.js';
import {
  esTextoNoVacio,
  MensajeInvalidoError,
} from '../../compartido/infraestructura/mensajeria/sobre.js';
import type { ConsumosPeriodoEntrada } from '../aplicacion/casos-uso/cerrar-consumos.caso-uso.js';

/**
 * Valida `datos` de `CerrarConsumos` o `ReabrirConsumos` (`planillaId, obraId, periodo`); si
 * falta algo o el periodo no es `AAAA-MM`, `MensajeInvalidoError` (va directo a fallidos).
 * Lector tolerante: los campos desconocidos se ignoran.
 */
export function leerDatosConsumos(
  tipo: string,
  datos: Record<string, unknown>,
): ConsumosPeriodoEntrada {
  const faltan: string[] = [];
  if (!esTextoNoVacio(datos.planillaId)) faltan.push('planillaId');
  if (!esTextoNoVacio(datos.obraId)) faltan.push('obraId');
  if (!esTextoNoVacio(datos.periodo)) faltan.push('periodo');
  if (faltan.length > 0) {
    throw new MensajeInvalidoError(
      `${tipo} con datos incompletos: falta ${faltan.join(', ')}.`,
    );
  }
  const periodo = datos.periodo as string;
  if (!FORMATO_PERIODO.test(periodo)) {
    throw new MensajeInvalidoError(
      `${tipo} con un periodo que no es AAAA-MM: ${periodo.slice(0, 20)}.`,
    );
  }
  return {
    planillaId: datos.planillaId as string,
    obraId: datos.obraId as string,
    periodo,
  };
}
