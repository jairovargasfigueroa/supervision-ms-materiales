# Materiales: estructura y librerías

Obligatorio para todo el código de este servicio. Si algo no encaja, propón el cambio antes de salirte de esta estructura.

## Librerías

NestJS 12, `@nestjs/config`, `@nestjs/mongoose` + `mongoose` 9, `class-validator` 0.15 + `class-transformer` 0.5 (con `ValidationPipe` global, `whitelist` y `transform`), `@nestjs/swagger` 12 (Swagger UI en `/docs` solo en desarrollo), `amqplib`, `jose` 6. Pruebas: Vitest, `supertest`, `mongodb-memory-server` 11 en modo *replica set*. Módulos ES: imports con extensión `.js`.

## Árbol (Clean Architecture)

```
src/
  main.ts                          # cuerpo JSON de 1 MB, registros, Swagger (dev), puerto
  app.module.ts
  compartido/
    compartido.module.ts           # JWKS (CONJUNTO_CLAVES), ValidadorToken, JwtGuard (APP_GUARD), ValidationPipe (APP_PIPE), filtro (APP_FILTER), middleware X-Request-Id
    dominio/        regla-negocio.error.ts, periodo.ts (America/La_Paz), cantidad.ts (3 decimales, milésimas),
                    paginacion.ts (CriteriosPagina, Pagina, validarPaginacion: tamano > 100 → PAGINACION_INVALIDA)
    infraestructura/
      auth/         validador-token.ts (jose + JWKS), jwt.guard.ts (guardia global), publico.decorator.ts (@Publico),
                    usuario-autenticado.ts, roles.guard.ts (guardia global, después de JwtGuard), roles.decorator.ts (@Roles),
                    roles-efectivos.ts (función pura: roles que cuentan según azp), usuario-actual.decorator.ts (@UsuarioActual)
      http/         problem-details.filter.ts, request-id.middleware.ts, solicitud.ts (tipo de la petición con requestId y usuario),
                    validacion.ts (crearValidationPipe: whitelist, transform y 400 DATOS_INVALIDOS con errores[] por campo)
      mensajeria/   mensajeria.module.ts, rabbit.cliente.ts (conexión, topología, prefetch 10, reconexión), sobre.ts (sobre y MensajeInvalidoError),
                    consumidor.ts (reparte por `tipo`, reintentos con x-intentos y plataforma.fallidos), inbox.schema.ts, inbox.ts (procesarUnaVez),
                    outbox.schema.ts, outbox.ts (Outbox.agregar: sobre común en outbox_evento, solo dentro de una transacción),
                    outbox.publicador.ts (OutboxPublicador: cada 1 s publica los pendientes en orden con RabbitCliente.publicar)
      mongo/        transaccion.ts (Transaccion.ejecutar y sesionActual(): la sesión viaja en AsyncLocalStorage),
                    decimal.ts (Decimal128 ↔ number: los `decimal` de datos.md)
  salud/                           # GET /salud (@Publico, no toca MongoDB ni RabbitMQ)
    presentacion/   salud.controller.ts
    salud.module.ts
  acceso-obra/                     # copia de asignaciones (obra_acceso), 002
    dominio/        obra-acceso.ts (ObraAcceso, Asignaciones; reglas puedeVer y puedeRegistrarMovimientos)
    aplicacion/
      acceso-obra.servicio.ts (AccesoObraServicio, exportado: puedeVer, exigirVer, exigirRegistrarMovimientos, filtrarVisibles)
      puertos/      obra-acceso.repositorio.ts
      casos-uso/    registrar-obra-acceso.caso-uso.ts
    infraestructura/
      obra-acceso.schema.ts, obra-acceso.repositorio.mongo.ts (upsert por obraId),
      obra-registrada.consumidor.ts (manejador de ObraRegistrada; valida datos)
    acceso-obra.module.ts
  catalogo/                        # un módulo por contexto: catalogo, stock, movimientos, cierres
    dominio/        material.ts (normalizarCodigo, errores del catálogo), tipo-material.ts
    aplicacion/
      puertos/      material.repositorio.ts (interfaz + token de inyección, exportado para stock y movimientos)
      casos-uso/    crear-material.caso-uso.ts, actualizar-material.caso-uso.ts, listar-materiales.caso-uso.ts
    infraestructura/
      material.schema.ts, material.repositorio.mongo.ts
    presentacion/
      materiales.controller.ts, dto/crear-material.dto.ts, dto/actualizar-material.dto.ts, dto/listar-materiales.dto.ts,
      dto/material.respuesta.ts
    catalogo.module.ts
  stock/                           # stock por obra (stock_obra), 003
    dominio/        stock-obra.ts (StockObra, calcularEstado BAJO/JUSTO/OK, cruzaAlBajo, resumirStock: materiales BAJO por obra, 009)
    aplicacion/
      fila-stock.ts (stock + material, para las respuestas)
      puertos/      stock.repositorio.ts (interfaz + token, exportado para movimientos)
      casos-uso/    listar-stock-obra.caso-uso.ts, fijar-minimo.caso-uso.ts (upsert en transacción),
                    resumir-stock.caso-uso.ts (009: filtrarVisibles + listarPorObras + resumirStock)
    infraestructura/
      stock-obra.schema.ts (_id obraId:materialId), stock.repositorio.mongo.ts (fijarMinimo atómico: devuelve la fila anterior; ajustar con control de versión: StockCambiadoError si choca; listarPorObras con $in)
    presentacion/
      stock.controller.ts, dto/fijar-minimo.dto.ts, dto/stock.respuesta.ts,
      stock-resumen.controller.ts (GET /stock/resumen, 009), dto/resumir-stock.dto.ts (obraIds separados por coma, 1 a 100), dto/resumen-stock.respuesta.ts
    stock.module.ts
  cierres/                         # cierres de periodo (cierre_periodo): los escribe la 008, los lee la 004
    dominio/        cierre-periodo.ts (CierrePeriodo, EstadoCierre CERRADO/REABIERTO, decidirCierre, decidirReapertura, motivoCerradoPorOtra)
    aplicacion/
      puertos/      cierre-periodo.repositorio.ts (estaCerrado, buscar, guardar; token exportado para movimientos),
                    movimientos-periodo.repositorio.ts (marcarCerrados: `cerrado` en los movimientos de la obra y periodo)
      casos-uso/    cerrar-consumos.caso-uso.ts (008: transacción cierre_periodo + movimiento + outbox ConsumosCerrados o CierreFallido),
                    reabrir-consumos.caso-uso.ts (008: REABIERTO, cerrado = false, outbox ConsumosReabiertos; no toca el cierre de otra planilla)
    infraestructura/
      cierre-periodo.schema.ts (_id obraId:periodo), cierre-periodo.repositorio.mongo.ts (guardar: replaceOne con upsert),
      movimientos-periodo.repositorio.mongo.ts (updateMany sobre `movimiento`; reutiliza el modelo de movimientos),
      datos-consumos.ts (leerDatosConsumos: planillaId, obraId, periodo AAAA-MM; si no, MensajeInvalidoError),
      cerrar-consumos.consumidor.ts, reabrir-consumos.consumidor.ts (manejadores de CerrarConsumos y ReabrirConsumos)
    cierres.module.ts
  movimientos/                     # ingresos y salidas (movimiento), 004
    dominio/        movimiento.ts (Movimiento, TipoMovimiento, NotaRemision, ajusteDeStock, superaElStock, periodoCerrado, datosMovimientoRegistrado),
                    consumo.ts (ConsumoPartida: suma de salidas por partida y material, 006)
    aplicacion/
      puertos/      movimiento.repositorio.ts (interfaz + token; MovimientoRepetidoError si el id ya existe; ORDENES_MOVIMIENTO; sumarSalidas)
      casos-uso/    registrar-movimiento.caso-uso.ts (transacción, idempotencia, reintento si el stock choca, outbox StockBajo y MovimientoRegistrado),
                    listar-movimientos.caso-uso.ts (paginado, exigirVer), consultar-consumos.caso-uso.ts (006, exigirVer)
    infraestructura/
      movimiento.schema.ts (supera_stock, cerrado; índices por obra y periodo, material, partida y periodo),
      movimiento.repositorio.mongo.ts (sumarSalidas: agregación $match obra + periodo + SALIDA, $group por partida y material)
    presentacion/
      movimientos.controller.ts (POST /movimientos: 201 o 200 si es repetido; GET /obras/{obraId}/movimientos; GET /obras/{obraId}/consumos),
      dto/registrar-movimiento.dto.ts, dto/movimiento-registrado.respuesta.ts, dto/listar-movimientos.dto.ts, dto/movimiento.respuesta.ts,
      dto/consultar-consumos.dto.ts, dto/consumo.respuesta.ts
    movimientos.module.ts
  semilla/                         # datos de prueba (011): infraestructura; ningún módulo del negocio la importa
    main.ts                        # `node dist/semilla/main.js cargar|vaciar` (npm run semilla / semilla:vaciar): contexto sin HTTP, resumen, código de salida
    semilla.module.ts              # SemillaModule.registrar(config?): configuración + Mongoose (con la guarda antes de conectar) + esquemas; sin mensajería
    guarda.ts                      # verificarGuarda: NODE_ENV=production o host de MONGODB_URI no local → GuardaSemillaError
    fecha-relativa.ts              # resolver(expresion, D) (D±n, D±n hh:mm, M0, M±k, M±k/dd hh:mm en America/La_Paz), fechaDeCarga(SEMILLA_FECHA)
    materiales.json                # copia de docs/datos-prueba.md (secciones 5, 6 y 9), con fechas relativas
    datos-semilla.ts               # tipos del archivo y leerDatosSemilla (valida la forma)
    preparar-semilla.ts            # prepararSemilla: fechas, periodo, cerrado, supera_stock y stock con las reglas del dominio; verifica contra el documento
    cargar-semilla.ts              # CargarSemilla: upsert con $setOnInsert por _id en una transacción; conteos
    vaciar.ts                      # VaciarSemilla: deleteMany de las colecciones del negocio (incluye outbox_evento y mensaje_procesado) en una transacción
test/
  utilidades/tokens-prueba.ts      # par de claves RSA de prueba, JWKS local y tokens firmados (firmarConRoles(roles, azp) por rol)
  utilidades/canal-prueba.ts       # dobles del canal de RabbitMQ (CanalPrueba) y de RabbitCliente para el outbox (RabbitPrueba), y mensajes de prueba
  utilidades/obra-acceso-memoria.ts # repositorio de obra_acceso en memoria (unitarias)
  utilidades/material-memoria.ts   # repositorio de material en memoria (unitarias)
  utilidades/stock-memoria.ts      # repositorio de stock_obra en memoria (unitarias)
  utilidades/movimiento-memoria.ts # repositorios de movimiento y cierre_periodo en memoria (unitarias)
  utilidades/app-prueba.ts         # app HTTP con mongodb-memory-server (expone su `uri`), tokens de prueba y doble de RabbitCliente (e2e)
  seguridad.e2e-spec.ts            # /salud, token y X-Request-Id (sin MongoDB)
  roles.e2e-spec.ts                # @Roles y RolesGuard: 401/403/200 por rol y azp (controlador solo de la prueba)
  catalogo.e2e-spec.ts             # GET/POST/PUT /materiales con mongodb-memory-server
  stock.e2e-spec.ts                # GET /obras/{id}/stock y PUT .../minimo: upsert, estados, obra_acceso, roles, StockBajo
  outbox.e2e-spec.ts               # Outbox.agregar (en transacción) y OutboxPublicador (orden, propiedades, sin conexión, reintento) con mongodb-memory-server
  acceso-obra.e2e-spec.ts          # consumidor de ObraRegistrada (inbox, reintentos, fallidos) y AccesoObraServicio con mongodb-memory-server y CanalPrueba
  movimientos.e2e-spec.ts          # POST /movimientos y GET /obras/{id}/movimientos: stock, idempotencia, periodo cerrado, acceso, outbox
  consumos.e2e-spec.ts             # GET /obras/{id}/consumos: solo salidas del periodo, 400 sin periodo, 403 por rol, 404 por acceso
  stock-resumen.e2e-spec.ts        # GET /stock/resumen (009): materiales BAJO por obra, obras no visibles omitidas, 400 por obraIds, 403 por rol
  cierres.e2e-spec.ts              # CerrarConsumos y ReabrirConsumos (008): cierre_periodo, movimientos marcados, outbox, idempotencia, otra planilla, fallidos
  semilla.e2e-spec.ts              # semilla (011) con D = 2026-10-28: dos cargas sin duplicar, stock y estados, supera_stock, cerrado, consumos, /stock/resumen, vaciar, guarda
src/**/*.spec.ts                   # unitarias junto al archivo
```

## Reglas

- `dominio` no importa NestJS ni Mongoose. `aplicacion` depende solo de `dominio` y de interfaces de `puertos`.
- Los casos de uso son clases `@Injectable()` con un método `ejecutar(...)`; reciben los repositorios por token de inyección.
- Los controladores validan con DTO de `class-validator`, llaman al caso de uso y devuelven un objeto de `*.respuesta.ts`.
- Autenticación: `JwtGuard` es global y exige token en toda ruta salvo las marcadas con `@Publico()` (solo `/salud`). Las rutas inexistentes no pasan por el guardia: `problem-details.filter.ts` valida el token antes de responder `404`, así que sin token válido responden `401 NO_AUTENTICADO`. El JWKS se pide a Keycloak la primera vez que llega un token (la app arranca sin Keycloak); en las pruebas se reemplaza `CONJUNTO_CLAVES` por un `createLocalJWKSet`.
- Autorización por rol (001): cada ruta declara sus roles con `@Roles('admin', 'gerente')` (tabla de roles de `docs/contratos.md`). `RolesGuard` es global, corre después de `JwtGuard` y responde `403 SIN_PERMISO` si el usuario no tiene ninguno. Cuentan solo los roles que da `rolesEfectivos(roles, azp)` (convenciones, «Usuario con varios roles»): `azp = portal` → solo `cliente`; `erp` o `app-obra` → solo los internos; otro cliente (de servicio) → los del token tal cual. Toda regla que decida por rol (también la visibilidad de obras) usa esa función, nunca `usuario.roles` directo. Una ruta sin `@Roles()` exige solo token válido; las `@Publico()` no pasan por el rol.
- Cada petición se registra con su `X-Request-Id` (método, ruta sin la consulta, estado y duración); nunca se registran encabezados, tokens ni cuerpos.
- Las reglas del negocio lanzan `ReglaNegocioError(codigo, mensaje, status)`; `problem-details.filter.ts` la convierte en Problem Details.
- Acceso a una obra: los casos de uso que reciben un `obraId` importan `AccesoObraModule` y llaman a `AccesoObraServicio` con el `UsuarioAutenticado` (el servicio aplica `rolesEfectivos`): `exigirVer` para leer (003, 004, 006), `exigirRegistrarMovimientos` para `POST /movimientos` (004) y `filtrarVisibles` para listas de obras (009). La obra que no está en `obra_acceso` o que el usuario no ve responde `404 OBRA_NO_ENCONTRADA`, también para `admin`.
- Escrituras con varias colecciones (movimiento + stock + outbox) en una transacción de MongoDB (`transaccion.ts`). Los eventos se publican siempre por el outbox: el caso de uso llama a `Outbox.agregar(tipo, datos, correlacionId)` dentro de `Transaccion.ejecutar`; nunca publica directo en RabbitMQ. Los repositorios pasan `sesionActual()` a cada operación (`.session(sesionActual())` o `{ session: sesionActual() }`); fuera de una transacción es `null` y no cambia nada.
- Mensajes recibidos: cada módulo que escucha un tipo tiene un manejador (`ManejadorMensaje`) en su `infraestructura/` que se registra en `ConsumidorMensajes` en `onModuleInit`, valida `datos` (si faltan, `MensajeInvalidoError`) y llama a su caso de uso. El consumidor lo ejecuta dentro del inbox (`mensaje_procesado` + escrituras del caso de uso en una transacción).
- Nombres de archivo en `kebab-case` con sufijo de tipo (`.caso-uso.ts`, `.controller.ts`, `.schema.ts`, `.dto.ts`); clases en español.

## Ejemplo de punta a punta

`POST /movimientos` → `MovimientosController.registrar(dto)` → `RegistrarMovimientoCasoUso.ejecutar(entrada, usuario)` → valida acceso (`AccesoObraServicio.exigirRegistrarMovimientos`) y periodo → en transacción: `MovimientoRepositorio.guardar`, `StockRepositorio.ajustar`, `Outbox.agregar` → `201`.

## Pruebas

- Unitarias del dominio y de los casos de uso con repositorios en memoria.
- `test/*.e2e-spec.ts` con `mongodb-memory-server` (replica set) y tokens firmados con una clave de prueba.
- `npm test` y `npm run test:e2e` (los archivos e2e corren de a uno: cada uno levanta su MongoDB en memoria).
