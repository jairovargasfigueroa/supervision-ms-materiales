# 501 · Servidores MCP · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/501-servidores-mcp/` de la carpeta que agrupa los proyectos. Contratos: `docs/contratos.md` de este proyecto.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [ ] Instalar `@modelcontextprotocol/server` 2, `@modelcontextprotocol/express` 2 y `zod` 4
- [ ] Módulo `src/mcp/`: `POST /mcp` con `RolesGuard` y `@Roles('agente_ia')`, transporte sin estado; visibilidad de `agente_ia` igual a `gerente`
- [ ] Herramienta `stock_obra` (filtro por estados, nombre de obra desde `obra_acceso`, orden BAJO → JUSTO → OK)
- [ ] Herramienta `consumos_partida` (usado, número de salidas, salidas que superaron el stock, `cerrado`)
- [ ] Errores de herramienta y registro de cada llamada con `X-Request-Id`
- [ ] Pruebas: 401 / 403 / 200, `tools/list` exacto, cifras iguales al REST, argumentos maliciosos, solo lectura (ninguna colección cambia)
