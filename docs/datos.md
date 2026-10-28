# Materiales: datos (MongoDB)

Base propia: `materiales_db`. Ningún otro servicio la lee. Las referencias a otros servicios («ref») son solo ids.

## Colecciones del sistema base

### material
| Campo | Tipo | Notas |
|---|---|---|
| _id | string | PK |
| codigo | string | único |
| nombre | string | |
| tipo | string | cemento, acero, agregado, … |
| unidad | string | bolsa, kg, m³, … |
| unidad_plural | string | |
| precio_referencial | decimal | |
| proveedor_habitual_id | string | ref Finanzas (capa 2) |
| activo | bool | |
| atributos | arreglo de `{ nombre, valor }` | embebido; varía según el tipo de material |

### stock_obra
| Campo | Tipo | Notas |
|---|---|---|
| _id | string | `obra_id` + `material_id` |
| cantidad | decimal | se recalcula con los movimientos |
| minimo | decimal | stock mínimo para esa obra |
| version | int | control de concurrencia |
| actualizado_en | date | |

### movimiento
| Campo | Tipo | Notas |
|---|---|---|
| _id | string (uuid) | PK, creado en el celular |
| obra_id | string | ref Obras |
| material_id | string | FK material |
| tipo | string | `INGRESO`, `SALIDA` |
| cantidad | decimal | |
| partida_id | string | ref Obras; obligatorio en salidas |
| orden_compra_id | string | ref Finanzas; en ingresos de una compra (capa 2) |
| periodo | string | `AAAA-MM` |
| cerrado | bool | true cuando el periodo se cerró |
| supera_stock | bool | la salida superó el stock que había (alerta) |
| registrado_por | string | ref Keycloak |
| registrado_en | date | |
| nota_remision | `{ numero, clave_foto }` | embebido, opcional en ingresos |

### cierre_periodo
| Campo | Tipo | Notas |
|---|---|---|
| _id | string | `obra_id` + `periodo` |
| planilla_id | string | ref Obras |
| estado | string | `CERRADO`, `REABIERTO` |
| cerrado_en | date | |

### obra_acceso
| Campo | Tipo | Notas |
|---|---|---|
| _id | string | `obraId` (ref Obras) |
| nombre | string | |
| residente_id | string | ref Keycloak |
| maestro_id | string | ref Keycloak |
| almacenero_id | string | ref Keycloak |
| cliente_id | string | ref Keycloak |
| actualizado_en | date | |

Copia de las asignaciones de cada obra; llega con `ObraRegistrada`. Sirve para validar quién puede ver o registrar en cada obra.

### outbox_evento
| Campo | Tipo | Notas |
|---|---|---|
| _id | string (uuid) | PK; es el `id` del mensaje |
| tipo | string | |
| payload | objeto | sobre completo del mensaje |
| creado_en | date | |
| publicado_en | date | nulo hasta publicarse |

Se escribe en la misma transacción de MongoDB que el movimiento o el cierre (requiere MongoDB como *replica set*, también en desarrollo).

### mensaje_procesado
| Campo | Tipo | Notas |
|---|---|---|
| _id | string (uuid) | `id` del mensaje recibido |
| procesado_en | date | |

## Índices previstos

- `movimiento`: (`obra_id`, `periodo`), (`obra_id`, `material_id`), (`obra_id`, `partida_id`, `periodo`).
- `material`: `codigo` único.

## Relaciones

- material 1 — 0..* stock_obra · material 1 — 0..* movimiento
- cierre_periodo agrupa los movimientos de una obra en un periodo
