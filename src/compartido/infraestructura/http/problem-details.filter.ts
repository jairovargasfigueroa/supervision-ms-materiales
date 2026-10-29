import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReglaNegocioError } from '../../dominio/regla-negocio.error.js';
import { autenticar } from '../auth/jwt.guard.js';
import { ValidadorToken } from '../auth/validador-token.js';
import type { Solicitud } from './solicitud.js';

interface ProblemDetails {
  type: 'about:blank';
  title: string;
  status: number;
  detail?: string;
  codigo: string;
  errores?: { campo: string; mensaje: string }[];
}

/** Título y código genérico por estado (convenciones, «Errores REST»). */
const GENERICOS: Record<number, { title: string; codigo: string }> = {
  400: { title: 'Datos inválidos', codigo: 'DATOS_INVALIDOS' },
  401: { title: 'No autenticado', codigo: 'NO_AUTENTICADO' },
  403: { title: 'Sin permiso', codigo: 'SIN_PERMISO' },
  // Ruta que no existe (los recursos usan su propio código, por ejemplo OBRA_NO_ENCONTRADA).
  404: { title: 'No encontrado', codigo: 'RUTA_NO_ENCONTRADA' },
  413: {
    title: 'Archivo demasiado grande',
    codigo: 'ARCHIVO_DEMASIADO_GRANDE',
  },
  429: { title: 'Demasiadas peticiones', codigo: 'DEMASIADAS_PETICIONES' },
  500: { title: 'Error interno', codigo: 'ERROR_INTERNO' },
  503: { title: 'Servicio no disponible', codigo: 'SERVICIO_NO_DISPONIBLE' },
};

/** Convierte toda excepción en Problem Details (RFC 9457) con `codigo`. */
@Catch()
@Injectable()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly registro = new Logger(ProblemDetailsFilter.name);

  constructor(private readonly validador: ValidadorToken) {}

  async catch(excepcion: unknown, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const solicitud = http.getRequest<Solicitud>();
    const respuesta = http.getResponse<Response>();
    try {
      // Una ruta inexistente no pasa por el guardia del token: sin token válido se responde 401
      // (todas las rutas salvo /salud exigen token), y solo con token válido se responde 404.
      if (excepcion instanceof NotFoundException && !solicitud.usuario) {
        solicitud.usuario = await autenticar(this.validador, solicitud);
      }
      this.enviar(respuesta, this.convertir(excepcion, solicitud));
    } catch (otra) {
      this.enviar(respuesta, this.convertir(otra, solicitud));
    }
  }

  private convertir(excepcion: unknown, solicitud: Solicitud): ProblemDetails {
    if (excepcion instanceof ReglaNegocioError) {
      const generico = GENERICOS[excepcion.status];
      return {
        type: 'about:blank',
        title: generico?.title ?? excepcion.message,
        status: excepcion.status,
        detail: excepcion.message,
        codigo: excepcion.codigo,
      };
    }
    if (excepcion instanceof HttpException) {
      const status = excepcion.getStatus();
      const generico =
        GENERICOS[status] ?? GENERICOS[status >= 500 ? 500 : 400];
      const cuerpo = excepcion.getResponse();
      const datos =
        typeof cuerpo === 'object' && cuerpo !== null
          ? (cuerpo as Record<string, unknown>)
          : {};
      return {
        type: 'about:blank',
        title: generico.title,
        status,
        detail:
          typeof datos.detail === 'string' ? datos.detail : excepcion.message,
        codigo:
          typeof datos.codigo === 'string' ? datos.codigo : generico.codigo,
        ...(Array.isArray(datos.errores) ? { errores: datos.errores } : {}),
      };
    }
    this.registro.error(
      `Error no controlado requestId=${solicitud.requestId ?? '-'}`,
      excepcion instanceof Error ? excepcion.stack : String(excepcion),
    );
    return {
      type: 'about:blank',
      title: GENERICOS[500].title,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'Ocurrió un error inesperado.',
      codigo: GENERICOS[500].codigo,
    };
  }

  private enviar(respuesta: Response, problema: ProblemDetails): void {
    if (respuesta.headersSent) return;
    respuesta
      .status(problema.status)
      .type('application/problem+json')
      .json(problema);
  }
}
