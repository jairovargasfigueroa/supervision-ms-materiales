import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Min } from 'class-validator';
import {
  type Direccion,
  TAMANO_POR_DEFECTO,
} from '../../../compartido/dominio/paginacion.js';
import { FORMATO_PERIODO } from '../../../compartido/dominio/periodo.js';
import {
  ORDENES_MOVIMIENTO,
  type OrdenMovimiento,
} from '../../aplicacion/puertos/movimiento.repositorio.js';

/**
 * Consulta de `GET /obras/{obraId}/movimientos`: `periodo` (`AAAA-MM`, opcional) y paginación
 * (convenciones). El `tamano` mayor a 100 lo rechaza el caso de uso con `400 PAGINACION_INVALIDA`.
 */
export class ListarMovimientosDto {
  @IsOptional()
  @Matches(FORMATO_PERIODO, { message: 'Debe tener el formato AAAA-MM.' })
  periodo?: string;

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
  @IsIn(ORDENES_MOVIMIENTO, {
    message: `Debe ser uno de: ${ORDENES_MOVIMIENTO.join(', ')}.`,
  })
  orden: OrdenMovimiento = 'registradoEn';

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'Debe ser asc o desc.' })
  direccion: Direccion = 'desc';
}
