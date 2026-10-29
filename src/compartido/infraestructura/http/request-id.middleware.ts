import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { Solicitud } from './solicitud.js';

export const ENCABEZADO_REQUEST_ID = 'X-Request-Id';

/** Solo se acepta un `X-Request-Id` corto y sin caracteres raros (evita ensuciar los registros). */
const REQUEST_ID_VALIDO = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Usa el `X-Request-Id` que llega (o genera un UUID), lo devuelve en la respuesta junto con los encabezados
 * de seguridad, y registra
 * cada petición con él. No registra encabezados (token) ni cuerpos.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly registro = new Logger('HTTP');

  use(
    solicitud: Solicitud,
    respuesta: Response,
    siguiente: NextFunction,
  ): void {
    const recibido = solicitud.header(ENCABEZADO_REQUEST_ID);
    const requestId =
      recibido && REQUEST_ID_VALIDO.test(recibido) ? recibido : randomUUID();
    solicitud.requestId = requestId;
    respuesta.setHeader(ENCABEZADO_REQUEST_ID, requestId);
    // Encabezados de seguridad de las convenciones («Seguridad»)
    respuesta.setHeader('X-Content-Type-Options', 'nosniff');
    respuesta.setHeader('Referrer-Policy', 'no-referrer');

    const inicio = performance.now();
    respuesta.on('finish', () => {
      const ruta = solicitud.originalUrl.split('?')[0];
      const ms = Math.round(performance.now() - inicio);
      this.registro.log(
        `${solicitud.method} ${ruta} ${respuesta.statusCode} ${ms} ms requestId=${requestId}`,
      );
    });
    siguiente();
  }
}
