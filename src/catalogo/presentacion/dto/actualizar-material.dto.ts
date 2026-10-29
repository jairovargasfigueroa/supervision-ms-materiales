import { IsBoolean } from 'class-validator';
import { DatosMaterialDto } from './crear-material.dto.js';

/** `PUT /materiales/{id}`: el material completo, también `activo` (desactivar no borra). */
export class ActualizarMaterialDto extends DatosMaterialDto {
  @IsBoolean({ message: 'Debe ser verdadero o falso.' })
  activo: boolean;
}
