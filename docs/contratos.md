# Materiales: contratos

Fuente para este servicio. La copia general está en `docs/contratos/` de la carpeta que agrupa los proyectos. Errores en formato Problem Details con `codigo` (ver convenciones). Todas las rutas, salvo `/salud`, exigen token. JSON en `camelCase`.

## REST que expone (puerto 8082)

### GET /salud
Sin token · `200 {"estado":"ok"}`

### GET /materiales?busqueda=&soloActivos= · 002, 003, 006
Roles: todos los internos (`admin`, `residente`, `gerente`, `maestro`, `almacenero`). Paginado (convenciones): `pagina`, `tamano`, `orden`, `direccion`; responde `{ items, total, pagina, tamano }` con orden por defecto `codigo asc`. Cada elemento:
`[{ "id", "codigo": "CEM-IP30", "nombre": "Cemento IP-30", "tipo": "CEMENTO", "unidad": "bolsa", "unidadPlural": "bolsas", "precioReferencial": 62.00, "activo": true, "atributos": [{ "nombre": "peso", "valor": "50 kg" }] }]`

### POST /materiales · 003
Roles: `admin`. Recibe el material sin `id` (`activo` por defecto `true`). Devuelve `201` con el material.
Errores: `400` · `409 CODIGO_MATERIAL_REPETIDO`.

### PUT /materiales/{id} · 003
Roles: `admin`. Recibe el material completo (incluye `activo`). Devuelve `200`.
Errores: `404 MATERIAL_NO_ENCONTRADO` · `409 CODIGO_MATERIAL_REPETIDO`.

### GET /obras/{obraId}/stock · 003, 004
Roles: internos que pueden ver la obra (`obra_acceso`).
`[{ "materialId", "codigo", "nombre", "unidad", "unidadPlural", "cantidad": 120.0, "minimo": 100.0, "estado": "JUSTO" }]`
Errores: `404 OBRA_NO_ENCONTRADA`.

### PUT /obras/{obraId}/stock/{materialId}/minimo · 003
Roles: `admin`. Recibe `{ "minimo": 100 }`. Devuelve `200` con la fila de stock.
Errores: `404 OBRA_NO_ENCONTRADA` · `404 MATERIAL_NO_ENCONTRADO` · `422 MATERIAL_INACTIVO`.

### POST /movimientos · 004
Roles: `almacenero` asignado.
```json
{
  "id": "uuid generado en el celular", "obraId": "uuid", "materialId": "id",
  "tipo": "SALIDA", "cantidad": 12.5, "partidaId": "uuid",
  "notaRemision": { "numero": "NR-00123" }, "registradoEn": "2026-11-15T14:00:00Z"
}
```
`partidaId` obligatorio en `SALIDA`; `notaRemision` solo en `INGRESO` y opcional.
Devuelve `201` (o `200` si el `id` ya existía) `{ "id", "periodo": "2026-11", "superaStock": false, "stock": { "cantidad", "minimo", "estado" } }`.
Errores: `400` · `403` · `404 OBRA_NO_ENCONTRADA` · `422 MATERIAL_INACTIVO` · `409 PERIODO_CERRADO`.

### GET /obras/{obraId}/movimientos?periodo= · 004
Roles: internos que pueden ver la obra. Paginado (convenciones): `pagina`, `tamano`, `orden`, `direccion`; responde `{ items, total, pagina, tamano }` con orden por defecto `registradoEn desc`. Cada elemento: `[{ "id", "materialId", "tipo", "cantidad", "partidaId", "periodo", "superaStock", "cerrado", "registradoPor", "registradoEn" }]`

### GET /obras/{obraId}/consumos?periodo=AAAA-MM · 006
Roles: `admin`, `gerente` y `residente` asignado (si no ve la obra: `404 OBRA_NO_ENCONTRADA`). `[{ "partidaId", "materialId", "cantidad" }]` (suma de salidas).

### GET /stock/resumen?obraIds=a,b,c · 009
Roles: `admin`, `residente`, `gerente`. `[{ "obraId", "materialesBajos": 2 }]` (solo obras visibles).

## Eventos y comandos (RabbitMQ)

| Clave | Dirección | `datos` |
|---|---|---|
| `evento.obras.ObraRegistrada` | escucha | guarda `obra_acceso` con `obraId`, `nombre` y `asignaciones` |
| `comando.materiales.CerrarConsumos` | escucha | `planillaId, obraId, periodo` |
| `evento.materiales.ConsumosCerrados` | publica | `planillaId, obraId, periodo` |
| `evento.materiales.CierreFallido` | publica | `planillaId, motivo` |
| `comando.materiales.ReabrirConsumos` | escucha | `planillaId, obraId, periodo` |
| `evento.materiales.ConsumosReabiertos` | publica | `planillaId, obraId, periodo` |
| `evento.materiales.StockBajo` | publica | `obraId, materialId, cantidad, minimo` (capa 2) |
| `evento.materiales.MovimientoRegistrado` | publica | `movimientoId, obraId, materialId, tipo, cantidad, partidaId, periodo, superaStock, registradoEn` (capa 4) |

## Herramientas MCP (capa 5, solo lectura)

`consumos_partida`, `stock_obra`. Se especifican en la capa 5.
