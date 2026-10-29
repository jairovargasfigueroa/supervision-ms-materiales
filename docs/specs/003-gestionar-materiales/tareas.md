# 003 · Gestionar materiales · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/003-gestionar-materiales/` de la carpeta que agrupa los proyectos. Contratos: `docs/contratos.md` de este proyecto.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [x] Esquemas `material` (código único) y `stock_obra`; dominio con estados `BAJO`/`JUSTO`/`OK`
- [ ] `GET/POST/PUT /materiales` con normalización del código y errores
- [ ] `GET /obras/{obraId}/stock` y `PUT .../minimo` (upsert) con acceso por `obra_acceso`
- [ ] Outbox `StockBajo` al cruzar el mínimo
- [ ] Pruebas de la spec
