# Materiales: contratos

Fuente para este servicio. La copia general está en `docs/contratos/` de la carpeta que agrupa los proyectos. Errores en formato Problem Details con `codigo` (ver convenciones). Todas las rutas, salvo `/salud`, exigen token. JSON en `camelCase`.

## REST que expone (puerto 8082)

### GET /salud
Sin token · `200 {"estado":"ok"}`

### Token y `X-Request-Id` (todas las rutas)
- Token de Keycloak en `Authorization: Bearer …`: se valida firma (JWKS del realm), vencimiento, emisor `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}` y audiencia `plataforma-api`. Sin token o con uno inválido: `401 NO_AUTENTICADO` (si Keycloak no responde al pedir el JWKS: `503 SERVICIO_NO_DISPONIBLE`) (también en rutas que no existen). Con token válido, una ruta que no existe responde `404 RUTA_NO_ENCONTRADA`.
- Rol (001): cada ruta indica abajo sus «Roles». Con token válido pero sin ninguno de esos roles: `403 SIN_PERMISO`. Cuentan solo los roles de la aplicación desde la que se inició sesión (`azp` del token): `portal` → solo `cliente`; `erp` o `app-obra` → solo `admin`, `residente`, `gerente`, `maestro`, `almacenero`; un cliente de servicio (`gateway`, `ia-agentes`, `n8n`) → los roles del token tal cual.
- `X-Request-Id`: si llega se usa (hasta 128 caracteres `A-Z a-z 0-9 . _ : -`), si no se genera un UUID; siempre vuelve en la respuesta.

### GET /materiales?busqueda=&soloActivos= · 002, 003, 006
Roles: todos los internos (`admin`, `residente`, `gerente`, `maestro`, `almacenero`). Paginado (convenciones): `pagina`, `tamano`, `orden`, `direccion`; responde `{ items, total, pagina, tamano }` con orden por defecto `codigo asc`. Cada elemento:
`[{ "id", "codigo": "CEM-IP30", "nombre": "Cemento IP-30", "tipo": "CEMENTO", "unidad": "bolsa", "unidadPlural": "bolsas", "precioReferencial": 62.00, "activo": true, "atributos": [{ "nombre": "peso", "valor": "50 kg" }] }]`
- `busqueda`: parte del código o del nombre, sin distinguir mayúsculas. `soloActivos`: `true` o `false` (sin el parámetro, todos).
- `orden`: `codigo`, `nombre`, `tipo` o `precioReferencial`; `direccion`: `asc` o `desc`.
- Errores: `400 PAGINACION_INVALIDA` (`tamano` mayor a 100) · `400` (otro parámetro mal formado: `pagina` o `tamano` menor a 1, `orden` o `direccion` desconocidos).

### POST /materiales · 003
Roles: `admin`. Recibe el material sin `id` (`activo` por defecto `true`, `atributos` por defecto `[]`). Devuelve `201` con el material.
Validación (003, criterio 3): `codigo` obligatorio, hasta 20 caracteres, se guarda en mayúsculas sin espacios a los costados; `nombre` obligatorio, hasta 120; `tipo` uno de `CEMENTO`, `ACERO`, `AGREGADO`, `LADRILLO`, `MADERA`, `ELECTRICO`, `SANITARIO`, `PINTURA`, `OTRO`; `unidad` y `unidadPlural` obligatorias; `precioReferencial` ≥ 0 con hasta 2 decimales; cada atributo con `nombre` y `valor` no vacíos. Los textos se guardan sin espacios a los costados.
Errores: `400` (con `errores[]` por campo, por ejemplo `atributos.0.valor`) · `409 CODIGO_MATERIAL_REPETIDO`.

### PUT /materiales/{id} · 003
Roles: `admin`. Recibe el material completo (incluye `activo`, obligatorio; mismas validaciones que `POST`). Devuelve `200`.
Errores: `400` · `404 MATERIAL_NO_ENCONTRADO` · `409 CODIGO_MATERIAL_REPETIDO`.

### GET /obras/{obraId}/stock · 003, 004
Roles: internos que pueden ver la obra (`obra_acceso`).
`[{ "materialId", "codigo", "nombre", "unidad", "unidadPlural", "cantidad": 120.0, "minimo": 100.0, "estado": "JUSTO" }]`
Un elemento por material con movimientos o mínimo en la obra (también los materiales desactivados), ordenados por `codigo`. `estado` se calcula al leer: `BAJO` si cantidad < mínimo; `JUSTO` si mínimo ≤ cantidad ≤ 1,25 × mínimo; `OK` si es mayor.
Errores: `404 OBRA_NO_ENCONTRADA` (la obra no está en `obra_acceso` o el usuario no la ve; también para `admin`).

### PUT /obras/{obraId}/stock/{materialId}/minimo · 003
Roles: `admin`. Recibe `{ "minimo": 100 }` (número ≥ 0 con hasta 3 decimales). *Upsert*: si el material no tenía fila en la obra, la crea con cantidad 0. Devuelve `200` con la fila de stock (mismo formato que un elemento de `GET /obras/{obraId}/stock`).
Errores, en este orden: `400` · `404 OBRA_NO_ENCONTRADA` · `404 MATERIAL_NO_ENCONTRADO` · `422 MATERIAL_INACTIVO`.

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
Validación: `id` UUID v4; `obraId` y `partidaId` UUID; `materialId` no vacío; `tipo` `INGRESO` o `SALIDA`; `cantidad` mayor que 0 con hasta 3 decimales; `partidaId` en un `INGRESO` o `notaRemision` en una `SALIDA` → `400`; `notaRemision.numero` no vacío (se guarda sin espacios a los costados); `registradoEn` en ISO 8601 con hora y zona (`Z` o `±hh:mm`).
En una transacción de MongoDB: `periodo` = mes de `registradoEn` en `America/La_Paz`; el stock del material en la obra suma (`INGRESO`) o resta (`SALIDA`) con control de versión (si choca con otro movimiento a la vez, se vuelve a intentar; si el material no tenía fila en la obra, se crea con mínimo 0); `superaStock` es `true` si una salida es mayor que el stock que había (se registra igual). `stock` es la fila después del movimiento.
Devuelve `201` (o `200` si el `id` ya existía) `{ "id", "periodo": "2026-11", "superaStock": false, "stock": { "cantidad", "minimo", "estado" } }`.
Envío repetido (mismo `id`, también a la vez): `200` con el movimiento como quedó y el stock actual, sin volver a sumar, restar ni publicar, aunque el resto del cuerpo sea distinto o el material o el periodo hayan cambiado después; solo para el almacenero asignado a la obra de ese movimiento (si no, `404 OBRA_NO_ENCONTRADA`).
Errores, en este orden: `400` · `403 SIN_PERMISO` (rol distinto de `almacenero`) · `404 OBRA_NO_ENCONTRADA` (no asignado o la obra no está en `obra_acceso`) · `404 MATERIAL_NO_ENCONTRADO` · `422 MATERIAL_INACTIVO` · `409 PERIODO_CERRADO` («El periodo AAAA-MM ya está cerrado»: hay un `cierre_periodo` `CERRADO` para la obra y ese periodo).

### GET /obras/{obraId}/movimientos?periodo= · 004
Roles: internos que pueden ver la obra. Paginado (convenciones): `pagina`, `tamano`, `orden`, `direccion`; responde `{ items, total, pagina, tamano }` con orden por defecto `registradoEn desc`. Cada elemento: `[{ "id", "materialId", "tipo", "cantidad", "partidaId", "periodo", "superaStock", "cerrado", "registradoPor", "registradoEn" }]`
- `periodo`: `AAAA-MM` (opcional; sin él, todos los periodos). `orden`: solo `registradoEn`; `direccion`: `asc` o `desc`. `partidaId` es `null` en los ingresos.
- Errores: `400 PAGINACION_INVALIDA` (`tamano` mayor a 100) · `400` (otro parámetro mal formado: `periodo` que no es `AAAA-MM`, `pagina` o `tamano` menor a 1, `orden` o `direccion` desconocidos) · `404 OBRA_NO_ENCONTRADA` (la obra no está en `obra_acceso` o el usuario no la ve; también para `admin`).

### GET /obras/{obraId}/consumos?periodo=AAAA-MM · 006
Roles: `admin`, `gerente` y `residente` asignado (si no ve la obra: `404 OBRA_NO_ENCONTRADA`). `[{ "partidaId", "materialId", "cantidad" }]` (suma de salidas).
- `periodo`: `AAAA-MM`, obligatorio. Solo cuentan las **salidas** de la obra con ese `periodo` (los ingresos y los otros periodos no); un elemento por cada par partida y material con salidas, ordenados por `partidaId` y luego `materialId`; `cantidad` con hasta 3 decimales. Sin salidas en el periodo: `[]`.
- Errores, en este orden: `400 DATOS_INVALIDOS` (`periodo` ausente o que no es `AAAA-MM`) · `403 SIN_PERMISO` (`maestro`, `almacenero` o `cliente`) · `404 OBRA_NO_ENCONTRADA` (la obra no está en `obra_acceso` o el usuario no la ve; también para `admin`).

### GET /stock/resumen?obraIds=a,b,c · 009
Roles: `admin`, `residente`, `gerente`. `[{ "obraId", "materialesBajos": 2 }]` (solo obras visibles).
- `obraIds`: obligatorio, de 1 a 100 ids separados por coma (también vale repetir el parámetro); se quitan los espacios a los costados y los ids vacíos. El gateway pide en lotes de hasta 100.
- `materialesBajos`: cuántos materiales de la obra están en estado `BAJO` (cantidad < mínimo, calculado al leer, igual que en `GET /obras/{obraId}/stock`; también los materiales desactivados). Una obra visible sin filas de stock o sin materiales bajos devuelve `0`.
- Un elemento por obra pedida que el usuario ve (`admin` y `gerente`: todas; `residente`: las suyas), sin repetir y en el orden pedido. Las obras que no ve o que no están en `obra_acceso` se omiten sin error (puede responder `[]`).
- Errores: `400 DATOS_INVALIDOS` (`obraIds` ausente, vacío o con más de 100 ids; `errores[]` con `campo: "obraIds"`) · `403 SIN_PERMISO` (`maestro`, `almacenero` o `cliente`; se comprueba antes que la consulta).

## Eventos y comandos (RabbitMQ)

| Clave | Dirección | `datos` |
|---|---|---|
| `evento.obras.ObraRegistrada` | escucha | guarda `obra_acceso` con `obraId`, `nombre` y `asignaciones` |
| `comando.materiales.CerrarConsumos` | escucha | `planillaId, obraId, periodo` |
| `evento.materiales.ConsumosCerrados` | publica | `planillaId, obraId, periodo` |
| `evento.materiales.CierreFallido` | publica | `planillaId, motivo` |
| `comando.materiales.ReabrirConsumos` | escucha | `planillaId, obraId, periodo` |
| `evento.materiales.ConsumosReabiertos` | publica | `planillaId, obraId, periodo` |
| `evento.materiales.StockBajo` | publica | `obraId, materialId, cantidad, minimo` (003 y 004; lo escucha n8n en la capa 2) |
| `evento.materiales.MovimientoRegistrado` | publica | `movimientoId, obraId, materialId, tipo, cantidad, partidaId, periodo, superaStock, registradoEn` (capa 4) |

### Cómo se publica (outbox)

- Cada evento se guarda en `outbox_evento` en la misma transacción que el dato que lo origina; `OutboxPublicador` lo publica cada segundo en el exchange `plataforma` con la clave `evento.materiales.<Tipo>`, persistente, `contentType: application/json` y `messageId` = `id` del sobre, y lo marca publicado cuando el broker confirma. Sin conexión a RabbitMQ quedan pendientes y salen al reconectar, en orden. Un evento puede salir dos veces (corte justo después de publicar), nunca ninguna: los consumidores descartan los repetidos por `id`.
- Sobre común: `{ id, tipo, version: 1, ocurridoEn, origen: "materiales", correlacionId, datos }`. `correlacionId` es el `X-Request-Id` de la petición que lo originó si es un UUID (en las respuestas a un comando, el `correlacionId` del comando); si no, el `id` del mensaje.
- `StockBajo` se publica solo cuando el stock **cruza** el mínimo: queda `BAJO` y antes no lo estaba (o el material no tenía fila en la obra). Si ya estaba `BAJO`, no se repite. En la 003 lo dispara `PUT .../minimo` (por ejemplo, fijar un mínimo mayor que 0 a un material con cantidad 0); en la 004, un movimiento (por ejemplo, la primera salida de un material sin fila en la obra, que deja la cantidad negativa con mínimo 0).
- `MovimientoRegistrado` se publica con cada movimiento nuevo (no con un envío repetido), en la misma transacción que el movimiento y el ajuste del stock; `partidaId` es `null` en los ingresos y `registradoEn` va en ISO 8601 UTC. `correlacionId` de `StockBajo` y `MovimientoRegistrado`: el `X-Request-Id` de `POST /movimientos` si es un UUID.

### Saga «aprobar planilla» (008)

- `CerrarConsumos`: en una transacción, `cierre_periodo` (`_id = obraId:periodo`) pasa a `CERRADO` con esa `planillaId` (se crea si no existe o se reemplaza si estaba `REABIERTO`), todos los movimientos de la obra en el periodo quedan con `cerrado = true` y se publica `ConsumosCerrados`. Si ya está `CERRADO` por la misma planilla, responde `ConsumosCerrados` otra vez sin cambios; si está `CERRADO` por otra planilla, `CierreFallido` con `motivo` «Los consumos del periodo AAAA-MM ya fueron cerrados por otra planilla» (con el periodo del comando) y nada cambia.
- `ReabrirConsumos`: si el cierre es `CERRADO` por esa planilla, pasa a `REABIERTO` (conserva `cerrado_en`), los movimientos del periodo vuelven a `cerrado = false` y se publica `ConsumosReabiertos`. Sin cierre o ya `REABIERTO` por esa planilla, responde `ConsumosReabiertos` sin cambios. Si el cierre es de otra planilla, no se toca ni se publica nada (queda en el log).
- Las respuestas llevan el `correlacionId` del comando (el id de la saga en Obras). `periodo` debe ser `AAAA-MM`; si faltan `planillaId`, `obraId` o `periodo`, o el periodo no tiene ese formato, el mensaje va directo a `plataforma.fallidos`.

### Cómo se consume (cola `materiales`)

- Exchange `plataforma` (topic, durable) y colas `materiales` y `plataforma.fallidos` (durables, sin argumentos) declaradas por infra; al conectar, el servicio las comprueba con los mismos argumentos y enlaza `materiales` a las tres claves que escucha. Prefetch 10 y confirmación manual.
- Inbox: cada mensaje se aplica en una transacción de MongoDB que inserta su `id` en `mensaje_procesado` y hace las escrituras; un `id` repetido se confirma sin hacer nada.
- Si aplicar el mensaje falla: se vuelve a publicar en la cola `materiales` (exchange por defecto) con el encabezado `x-intentos` + 1 y se confirma el original; al tercer fallo se publica en `plataforma.fallidos`.
- Van directo a `plataforma.fallidos`: un cuerpo que no es JSON o sin sobre válido (`id`, `tipo`, `version` 1, `datos`), `datos` incompletos y los tipos que todavía no tienen consumidor.
- En `plataforma.fallidos` el cuerpo es el original sin cambios y los encabezados dicen por qué: `x-error` (texto del error), `x-intentos` (fallos), `x-cola-origen` (`materiales`) y `x-clave-origen` (clave de enrutamiento original).

## Herramientas MCP (capa 5, solo lectura)

`consumos_partida`, `stock_obra`. Se especifican en la capa 5.
