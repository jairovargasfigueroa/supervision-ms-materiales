# Materiales: contratos

**Estado: pendiente.** Aquí va la parte de los contratos generales (`docs/contratos/` de la carpeta general) que toca a este servicio. Lo de abajo es lo conocido hasta ahora; los detalles se definen en el diseño de cada funcionalidad.

## REST que expone

| Operación | Quién llama | Etapa |
|---|---|---|
| CRUD del catálogo de materiales | Gateway | Base |
| Definir stock mínimo por obra | Gateway | Base |
| Registrar ingreso / salida (id del celular) | App de obra, Sincronización | Base |
| Stock de una obra | Gateway, app de obra | Base |
| Material usado por partida y periodo | Gateway | Base |

## Eventos y comandos (RabbitMQ)

| Mensaje | Dirección | Notas |
|---|---|---|
| Cerrar consumos del periodo | escucha ← Obras | paso 3 de la saga |
| Consumos cerrados / fallo | publica → Obras | |
| Reabrir consumos | escucha ← Obras | compensación |
| Stock bajo | publica → n8n | capa 2 |
| Ingreso registrado | publica → n8n / Finanzas | capa 2 (genera la cuenta por pagar) |
| Salida registrada | publica | capa 4 (reportes y consumos atípicos) |

## Herramientas MCP (capa 5, solo lectura)

`consumos_partida`, `stock_obra`.
