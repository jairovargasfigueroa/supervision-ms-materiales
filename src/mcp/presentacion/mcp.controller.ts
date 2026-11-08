import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../compartido/infraestructura/auth/roles.decorator.js';
import type { Solicitud } from '../../compartido/infraestructura/http/solicitud.js';
import type { HerramientaMcp } from './herramienta.js';
import { crearServidorMcp, HERRAMIENTAS_MCP } from './servidor-mcp.js';
import { atenderPeticionMcp } from './transporte-http.js';

/**
 * Servidor MCP de solo lectura (501) en `POST /mcp`: solo el rol `agente_ia` (la *service account*
 * de `ia-agentes`); el token lo valida `JwtGuard` y el rol `RolesGuard`, como en el REST. Sin
 * estado: cada petición arma un servidor nuevo, así que `GET` (flujo SSE) y `DELETE` (cerrar
 * sesión) responden `405`.
 */
@Controller('mcp')
@Roles('agente_ia')
export class McpController {
  constructor(
    @Inject(HERRAMIENTAS_MCP)
    private readonly herramientas: readonly HerramientaMcp[],
  ) {}

  @Post()
  async atender(
    @Req() solicitud: Solicitud,
    @Res() respuesta: Response,
  ): Promise<void> {
    // JwtGuard ya dejó el usuario y el middleware, el X-Request-Id.
    const contexto = {
      usuario: solicitud.usuario!,
      requestId: solicitud.requestId ?? '',
    };
    await atenderPeticionMcp(
      crearServidorMcp(this.herramientas, contexto),
      solicitud,
      respuesta,
    );
  }

  @Get()
  leer(@Res() respuesta: Response): void {
    metodoNoPermitido(respuesta);
  }

  @Delete()
  cerrar(@Res() respuesta: Response): void {
    metodoNoPermitido(respuesta);
  }
}

/** Mismo cuerpo que da el SDK en modo sin estado (error JSON-RPC sin `id`). */
function metodoNoPermitido(respuesta: Response): void {
  respuesta
    .status(HttpStatus.METHOD_NOT_ALLOWED)
    .setHeader('Allow', 'POST')
    .json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
}
