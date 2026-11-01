import {
  type McpServer,
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/server';
import type { Response } from 'express';
import type { Solicitud } from '../../compartido/infraestructura/http/solicitud.js';

/** Encabezados que no se copian a la petición web: el cuerpo se vuelve a serializar. */
const SIN_COPIAR = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
]);

/**
 * Atiende un `POST /mcp` con un servidor MCP nuevo y el transporte HTTP «streamable» del SDK en
 * modo **sin estado** (`sessionIdGenerator: undefined`: no se guarda sesión entre llamadas) y con
 * **respuestas JSON** (`enableJsonResponse: true`: sin flujo SSE) (501, diseño).
 *
 * El transporte es el de `@modelcontextprotocol/server` (`Request`/`Response` web), así que aquí se
 * traduce la petición de Express (el adaptador `@modelcontextprotocol/express` no trae transporte y
 * no se usa). El cuerpo ya lo leyó el analizador JSON de Nest (1 MB) y se pasa como `parsedBody`.
 */
export async function atenderPeticionMcp(
  servidor: McpServer,
  solicitud: Solicitud,
  respuesta: Response,
): Promise<void> {
  const transporte = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await servidor.connect(transporte);
    const web = await transporte.handleRequest(aPeticionWeb(solicitud), {
      parsedBody: solicitud.body as unknown,
    });
    respuesta.status(web.status);
    web.headers.forEach((valor, nombre) => respuesta.setHeader(nombre, valor));
    respuesta.send(Buffer.from(await web.arrayBuffer()));
  } finally {
    await transporte.close();
    await servidor.close();
  }
}

function aPeticionWeb(solicitud: Solicitud): Request {
  const encabezados = new Headers();
  for (const [nombre, valor] of Object.entries(solicitud.headers)) {
    if (valor === undefined || SIN_COPIAR.has(nombre)) continue;
    for (const uno of Array.isArray(valor) ? valor : [valor]) {
      encabezados.append(nombre, uno);
    }
  }
  return new Request(`http://localhost${solicitud.originalUrl}`, {
    method: solicitud.method,
    headers: encabezados,
    body: JSON.stringify(solicitud.body ?? null),
  });
}
