# 010 · Notificaciones · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/010-notificaciones/` de la carpeta que agrupa los proyectos. Contratos: `docs/contratos.md` de este proyecto.

La 201 ya no amplía `StockBajo` (pasó a ser la cobranza automática el 01/11/2026): si la 010 necesita `obraNombre` y `material{…}` en el evento, los agrega ella.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [ ] `StockBajo` agrega `obraNombre` (de `obra_acceso`) y `material { codigo, nombre, unidad, unidadPlural }` en los dos lugares donde se publica (mínimo de la 003 y movimiento de la 004); sigue en `version: 1`; pruebas
