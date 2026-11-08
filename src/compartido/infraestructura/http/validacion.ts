import {
  BadRequestException,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';

/** Error de un campo en Problem Details (`errores[]`, convenciones «Errores REST»). */
export interface ErrorCampo {
  campo: string;
  mensaje: string;
}

/**
 * `ValidationPipe` global: valida los DTO de `class-validator`, quita los campos que no declaran
 * (`whitelist`) y convierte a la clase del DTO (`transform`). Si algo no es válido responde
 * `400 DATOS_INVALIDOS` con `errores[]` (`campo` con la ruta, por ejemplo `atributos.0.nombre`).
 */
export function crearValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errores) =>
      new BadRequestException({
        codigo: 'DATOS_INVALIDOS',
        detail: 'Algunos datos no son válidos.',
        errores: aplanar(errores),
      }),
  });
}

function aplanar(errores: ValidationError[], prefijo = ''): ErrorCampo[] {
  return errores.flatMap((error) => {
    const campo = prefijo ? `${prefijo}.${error.property}` : error.property;
    const propios = Object.values(error.constraints ?? {}).map((mensaje) => ({
      campo,
      mensaje,
    }));
    return [...propios, ...aplanar(error.children ?? [], campo)];
  });
}
