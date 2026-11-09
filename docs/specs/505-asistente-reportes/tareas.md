# 505 · Asistente de reportes y agentes completos · tareas de `Materiales`

Requisitos y diseño: `docs/specs/505-asistente-reportes/` de la carpeta que agrupa los proyectos (aprobada el 09/11/2026).

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [x] Aplicar «Cambios a contratos y datos» de Materiales: `docs/contratos.md` (`consumos_partida` con `obraId` opcional)
- [x] `consumos_partida` sin `obraId`: filas de todas las obras del periodo con `obraId` y `obraNombre` (hasta 500, `truncado`); con `obraId`, igual que hoy más esos dos campos; `tools/list` con `obraId` no obligatorio
- [ ] Pruebas: e2e de MCP (lote y `tools/list`) y unitarias en verde
