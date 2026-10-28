# Materiales: qué hace

## Responsabilidades

- Mantener el catálogo de materiales (código, nombre, tipo, unidad, precio referencial, atributos).
- Definir el stock mínimo de cada material por obra.
- Registrar ingresos y salidas de material en cada obra (la salida indica la partida de destino).
- Calcular el stock por obra y su estado (bajo, justo, ok).
- Informar el material usado por partida y periodo, para compararlo con lo previsto.
- Cerrar y reabrir los consumos de un periodo (paso 3 de la saga y su compensación).
- Avisar «stock bajo» para la automatización de compras (capa 2).

## Casos de uso

| Caso de uso | Quién | Etapa |
|---|---|---|
| Gestionar materiales (catálogo y stock mínimo) | Administración | Base |
| Registrar ingreso de material | Almacenero | Base |
| Registrar salida de material | Almacenero, maestro de obra | Base |
| Consultar stock y consumos de una obra | Residente, gerente | Base |
| Cerrar / reabrir consumos del periodo | Saga (Obras) | Base |
| Publicar «stock bajo» | Automático | Capa 2 |
| Herramientas MCP para los agentes | Servicio de IA | Capa 5 |

## Qué no hace

- No compra ni paga: las órdenes de compra y cuentas por pagar son de Finanzas.
- No conoce los precios del contrato ni las partidas en detalle; solo guarda el id de la partida.
- No gestiona proveedores (Finanzas).

## Reglas

Ver «Material y stock» en `docs/reglas-negocio.md` de la carpeta general.
