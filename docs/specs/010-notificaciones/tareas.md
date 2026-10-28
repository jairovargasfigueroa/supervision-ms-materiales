# 010 · Notificaciones · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/010-notificaciones/` de la carpeta que agrupa los proyectos. Contratos: `docs/contratos.md` de este proyecto.

Si la 201 ya está hecha (`StockBajo` ampliado con `obraNombre` y `material{…}`), marca la tarea sin cambios de código y anótalo en el commit de documentación.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [ ] `StockBajo` agrega `obraNombre` (de `obra_acceso`) y `material { codigo, nombre, unidad, unidadPlural }` en los dos lugares donde se publica (mínimo de la 003 y movimiento de la 004); sigue en `version: 1`; pruebas
