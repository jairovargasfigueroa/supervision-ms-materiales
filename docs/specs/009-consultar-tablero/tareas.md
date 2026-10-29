# 009 · Consultar tablero · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/009-consultar-tablero/` de la carpeta que agrupa los proyectos. Contratos: `docs/contratos.md` de este proyecto.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [x] `GET /stock/resumen?obraIds=` con el caso de uso `ResumirStockCasoUso` (visibilidad con `AccesoObraServicio.filtrarVisibles`, materiales `BAJO` por obra calculados al leer) y sus pruebas unitarias
- [ ] Pruebas de la spec: resúmenes con datos de prueba (e2e con mongodb-memory-server: conteo por obra, obras no visibles omitidas, validación de `obraIds`, roles)
