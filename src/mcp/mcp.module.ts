import { Module } from '@nestjs/common';
import type { HerramientaMcp } from './presentacion/herramienta.js';
import { McpController } from './presentacion/mcp.controller.js';
import { HERRAMIENTAS_MCP } from './presentacion/servidor-mcp.js';

/**
 * Servidor MCP de solo lectura (501): adaptador de entrada al lado de los controladores REST, que
 * reutiliza los casos de uso de consulta. Único lugar del servicio que usa `zod` (lo exige el SDK).
 */
@Module({
  controllers: [McpController],
  providers: [
    {
      provide: HERRAMIENTAS_MCP,
      useFactory: (): HerramientaMcp[] => [],
    },
  ],
})
export class McpModule {}
