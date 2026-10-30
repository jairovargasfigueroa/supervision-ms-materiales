# Materiales

Microservicio de la Plataforma de supervisión de obras: catálogo de materiales, stock por obra e ingresos y salidas.

NestJS · TypeScript · MongoDB.

```sh
cp .env.example .env   # completar los valores
npm install
npm run start:dev
```

Documentación del servicio en [`docs/`](docs/) e instrucciones para el agente en [`CLAUDE.md`](CLAUDE.md).

## Datos de prueba

Carga en `materiales_db` la parte de Materiales del conjunto de datos de prueba (funcionalidad 011; valores en `docs/datos-prueba.md` de `supervision-docs`, secciones 5, 6 y 9): 15 materiales (uno inactivo y uno sin proveedor habitual), 3 `obra_acceso`, 14 filas de `stock_obra` con su mínimo, 67 movimientos y 3 cierres de periodo. Normalmente la corre `infra/semilla/semilla.ps1` (o `.sh`) junto con Obras y Finanzas; también se puede correr sola.

| Comando | Qué hace |
|---|---|
| `npm run semilla` | Compila (`nest build`) y carga (`node dist/semilla/main.js cargar`). Solo inserta lo que no existe por `_id`: correrla dos veces no duplica nada y no pisa lo que se cambió en una demostración. |
| `npm run semilla:vaciar` | Compila y vacía todas las colecciones del negocio (`node dist/semilla/main.js vaciar`): `material`, `obra_acceso`, `stock_obra`, `movimiento`, `cierre_periodo`, `outbox_evento` y `mensaje_procesado`. Deja las colecciones y sus índices. |

Para volver al estado del documento: `npm run semilla:vaciar` y luego `npm run semilla` (es lo que hace `infra/semilla/recargar`).

**Fecha de carga.** Las fechas se calculan a partir de D: la de `SEMILLA_FECHA` (`AAAA-MM-DD`) o, si no viene, la de hoy en `America/La_Paz`. Para que los tres servicios usen la misma D, infra la calcula una vez y la pasa:

```powershell
# PowerShell (Node 24)
$env:SEMILLA_FECHA = '2026-10-28'; npm run semilla
Remove-Item Env:SEMILLA_FECHA
```

```sh
# Bash
SEMILLA_FECHA=2026-10-28 npm run semilla
```

**Configuración.** Usa `MONGODB_URI` (MongoDB como *replica set*: la carga va en una transacción) y `NODE_ENV`, del `.env` o del entorno (el entorno manda). Solo se conecta a MongoDB: no levanta HTTP, no se conecta a RabbitMQ y no publica eventos (`outbox_evento` queda vacía).

**Guardas.** La carga y el vaciado se niegan a correr, sin conectarse a la base, si `NODE_ENV=production` o si algún host de `MONGODB_URI` no es `localhost`, `127.0.0.1`, `::1` o `mongo` (el contenedor del Docker Compose de infra); `mongodb+srv://` tampoco se acepta. La variable `SEMILLA_PERMITIDA=si` la revisan los scripts de infra.

**Verificación.** Antes de escribir, la carga calcula `periodo`, `cerrado`, `supera_stock` y la cantidad de cada `stock_obra` recorriendo los movimientos (ingresos antes que salidas el mismo día) con las reglas del dominio, y **falla sin escribir nada** si el stock después de algún movimiento, la cantidad final o el estado (`BAJO`, `JUSTO`, `OK`) no coinciden con los de `src/semilla/materiales.json` (copia del documento).

**Salida.** Código 0 si terminó bien, 1 si falló (guarda, datos que no cuadran, MongoDB sin responder) y 2 si el modo no existe. Además del resumen legible, imprime una línea para los scripts:

```
RESUMEN_SEMILLA {"servicio":"materiales","fecha":"2026-10-28","insertados":{"material":15,…},"totales":{"material":15,"obra_acceso":3,"stock_obra":14,"movimiento":67,"cierre_periodo":3,"outbox_evento":0}}
RESUMEN_VACIADO {"servicio":"materiales","borrados":{"material":15,…,"mensaje_procesado":0}}
```

`insertados` cuenta lo que agregó esta carga; `totales`, lo que hay en cada colección al terminar. Conviene detener `npm run start:dev` antes de correrla (`nest build` vuelve a generar `dist/`).
