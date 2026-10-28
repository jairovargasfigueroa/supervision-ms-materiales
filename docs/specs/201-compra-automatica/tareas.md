# 201 · Compra automática por stock bajo · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/201-compra-automatica/` de la carpeta que agrupa los proyectos. Contratos: `docs/contratos.md` de este proyecto.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [ ] `proveedorHabitualId` en `POST /materiales`, `PUT /materiales/{id}` y `GET /materiales`
- [ ] `StockBajo` con `obraNombre` y `material{…}` en la publicación de 003 (mínimo) y 004 (movimiento)
- [ ] Colección `orden_compra_obra`; consumidor de `evento.finanzas.OrdenCompraCreada` con inbox; enlace de la cola `materiales`
- [ ] `GET /obras/{obraId}/ordenes-compra?estado=`
- [ ] `ordenCompraId` en `POST /movimientos`: validación, copia `RECIBIDA` y outbox `CompraRecibida` en la misma transacción
- [ ] Pruebas de la spec
