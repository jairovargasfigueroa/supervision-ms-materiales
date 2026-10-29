import { IsDefined, Matches } from 'class-validator';
import { FORMATO_PERIODO } from '../../../compartido/dominio/periodo.js';

/** Consulta de `GET /obras/{obraId}/consumos`: `periodo` (`AAAA-MM`) obligatorio. */
export class ConsultarConsumosDto {
  @IsDefined({ message: 'Es obligatorio.' })
  @Matches(FORMATO_PERIODO, { message: 'Debe tener el formato AAAA-MM.' })
  periodo: string;
}
