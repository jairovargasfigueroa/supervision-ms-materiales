# 004 · Registrar ingreso y salida de material · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/004-movimientos-material/` de la carpeta que agrupa los proyectos. Contratos: `docs/contratos.md` de este proyecto.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [x] Esquema `movimiento` (con `supera_stock`) y `cierre_periodo`; índices
- [ ] `POST /movimientos` en transacción: idempotencia, acceso, periodo en `America/La_Paz`, periodo cerrado, actualización de stock con versión
- [ ] Outbox `StockBajo` y `MovimientoRegistrado`
- [ ] `GET /obras/{obraId}/movimientos`
- [ ] Pruebas de la spec
