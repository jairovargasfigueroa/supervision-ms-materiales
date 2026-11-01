# 501 · Servidores MCP · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/501-servidores-mcp/` de la carpeta que agrupa los proyectos. Contratos: `docs/contratos.md` de este proyecto.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [x] Instalar `@modelcontextprotocol/server` 2.4 y `@modelcontextprotocol/express` 2.0 (versiones fijadas en la menor) y `zod` ^4.2 (solo se usa dentro de `src/mcp/`); aplicar «Cambios a contratos y datos» del diseño en `docs/contratos.md` y `docs/estructura.md`
- [x] Módulo `src/mcp/`: `POST /mcp` con `RolesGuard` y `@Roles('agente_ia')`, transporte sin estado con respuestas JSON (`GET` y `DELETE /mcp` → `405`); visibilidad de `agente_ia` igual a `gerente`
- [x] Herramienta `stock_obra` (filtro por estados, nombre de obra desde `obra_acceso`, orden BAJO → JUSTO → OK, `total`, `truncado`, anotaciones `readOnlyHint: true` y `openWorldHint: false`)
- [x] Herramienta `consumos_partida` (usado, número de salidas, salidas que superaron el stock, `cerrado`, máximo 200 filas con `truncado`, mismas anotaciones)
- [ ] Errores de herramienta (`ARGUMENTO_INVALIDO` sin consultar la base, `OBRA_NO_ENCONTRADA`, `ERROR_INTERNO`, tiempo máximo 5 s) y registro de cada llamada con `X-Request-Id`
- [ ] Pruebas: 401 / 403 / 200, `tools/list` exacto (esquemas y anotaciones), cifras iguales al REST, `truncado`, argumentos maliciosos, solo lectura (ninguna colección cambia)
