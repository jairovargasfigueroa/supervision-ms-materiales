import { McpServer } from '@modelcontextprotocol/server';
import {
  type ContextoMcp,
  type HerramientaMcp,
  registrarHerramienta,
} from './herramienta.js';

/** Token de inyección de la lista de herramientas que publica `/mcp`. */
export const HERRAMIENTAS_MCP = Symbol('HERRAMIENTAS_MCP');

/**
 * Servidor MCP nuevo para una petición (sin estado): solo herramientas, sin recursos ni *prompts*
 * (501, criterio 3).
 */
export function crearServidorMcp(
  herramientas: readonly HerramientaMcp[],
  contexto: ContextoMcp,
): McpServer {
  const servidor = new McpServer(
    { name: 'materiales', version: '0.1.0' },
    { capabilities: { tools: { listChanged: false } } },
  );
  for (const herramienta of herramientas) {
    registrarHerramienta(servidor, herramienta, contexto);
  }
  return servidor;
}
