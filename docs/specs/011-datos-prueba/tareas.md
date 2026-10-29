# 011 · Datos de prueba · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/011-datos-prueba/` de la carpeta que agrupa los proyectos. Datos: `docs/datos-prueba.md` (secciones 5 y 9). Contratos: `docs/contratos.md` de este proyecto (no cambian).

Se implementa **después de la 009**, cuando existen todas las colecciones del sistema base. Si una capa agrega colecciones o campos a Materiales (por ejemplo `orden_compra_obra` de la 201), esa capa amplía esta semilla en el mismo trabajo.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [x] Resolvedor de fechas relativas (`src/semilla/fecha-relativa.ts`) en zona `America/La_Paz` con D desde `SEMILLA_FECHA` o la fecha de hoy; pruebas con la tabla del diseño
- [x] `src/semilla/materiales.json`: 15 materiales (con `proveedor_habitual_id`, uno inactivo y uno sin proveedor), 3 `obra_acceso`, 14 mínimos, 67 movimientos y 3 cierres
- [x] `npm run semilla`: contexto de NestJS solo con Mongoose; *upsert* con `$setOnInsert` en una transacción; calcula `periodo`, `supera_stock`, `cerrado` y `stock_obra.cantidad` recorriendo los movimientos en orden; falla si el estado final no coincide con la tabla del documento; guarda contra `NODE_ENV=production` y base no local
- [ ] `npm run semilla:vaciar`: vacía todas las colecciones del negocio
- [ ] Pruebas (mongodb-memory-server en *replica set*, D = 2026-10-28): dos cargas sin duplicar; estados de las 14 filas de stock (1 `BAJO`, 2 `JUSTO`); solo la salida 20018 con `supera_stock`; consumos de la obra 1 en `2026-09`; `GET /stock/resumen`; `outbox_evento` vacía; guarda
- [ ] README: cómo correr la semilla sola y vaciarla
