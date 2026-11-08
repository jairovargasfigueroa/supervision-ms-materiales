import { z } from 'zod';
import { FORMATO_PERIODO } from '../../compartido/dominio/periodo.js';

// Mensajes de validación en español (los lee el modelo en ARGUMENTO_INVALIDO).
z.config(z.locales.es());

/**
 * Id de obra o de partida: un UUID, como en el REST (`obraId` de `POST /movimientos`). Así un
 * texto como `x' OR 1=1` es `ARGUMENTO_INVALIDO` antes de consultar la base.
 */
export const uuid = () => z.uuid();

/** `AAAA-MM` con mes de 01 a 12 (`2027-13` no vale). */
export const periodo = () =>
  z.string().regex(FORMATO_PERIODO, 'Debe tener el formato AAAA-MM.');

export const estadoStock = z.enum(['BAJO', 'JUSTO', 'OK']);
