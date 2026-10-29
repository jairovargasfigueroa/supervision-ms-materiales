# Materiales: estructura y librerías

Obligatorio para todo el código de este servicio. Si algo no encaja, propón el cambio antes de salirte de esta estructura.

## Librerías

NestJS 12, `@nestjs/config`, `@nestjs/mongoose` + `mongoose` 9, `class-validator` 0.15 + `class-transformer` 0.5 (con `ValidationPipe` global, `whitelist` y `transform`), `@nestjs/swagger` 12 (Swagger UI en `/docs` solo en desarrollo), `amqplib`, `jose` 6. Pruebas: Vitest, `supertest`, `mongodb-memory-server` 11 en modo *replica set*. Módulos ES: imports con extensión `.js`.

## Árbol (Clean Architecture)

```
src/
  main.ts                          # ValidationPipe, filtro de errores, Swagger (dev), puerto
  app.module.ts
  compartido/
    compartido.module.ts           # JWKS (CONJUNTO_CLAVES), ValidadorToken, JwtGuard (APP_GUARD), filtro (APP_FILTER), middleware X-Request-Id
    dominio/        regla-negocio.error.ts, periodo.ts (America/La_Paz), cantidad.ts
    infraestructura/
      auth/         validador-token.ts (jose + JWKS), jwt.guard.ts (guardia global), publico.decorator.ts (@Publico),
                    usuario-autenticado.ts, roles.guard.ts (guardia global, después de JwtGuard), roles.decorator.ts (@Roles),
                    roles-efectivos.ts (función pura: roles que cuentan según azp), usuario-actual.decorator.ts (@UsuarioActual)
      http/         problem-details.filter.ts, request-id.middleware.ts, solicitud.ts (tipo de la petición con requestId y usuario)
      mensajeria/   mensajeria.module.ts, rabbit.cliente.ts (conexión, topología, prefetch 10, reconexión), sobre.ts (sobre y MensajeInvalidoError),
                    consumidor.ts (reparte por `tipo`, reintentos con x-intentos y plataforma.fallidos), inbox.schema.ts, inbox.ts (procesarUnaVez),
                    outbox.schema.ts, outbox.publicador.ts (cuando se publique el primer evento: 004 y 008)
      mongo/        transaccion.ts (Transaccion.ejecutar y sesionActual(): la sesión viaja en AsyncLocalStorage)
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
    dominio/        material.ts, tipo-material.ts
    aplicacion/
      puertos/      material.repositorio.ts (interfaz + token de inyección)
      casos-uso/    crear-material.caso-uso.ts, actualizar-material.caso-uso.ts, listar-materiales.caso-uso.ts
    infraestructura/
      material.schema.ts, material.repositorio.mongo.ts
    presentacion/
      materiales.controller.ts, dto/crear-material.dto.ts, dto/material.respuesta.ts
    catalogo.module.ts
test/
  utilidades/tokens-prueba.ts      # par de claves RSA de prueba, JWKS local y tokens firmados (firmarConRoles(roles, azp) por rol)
  utilidades/canal-prueba.ts       # doble del canal de RabbitMQ (CanalPrueba) y mensajes de prueba (sin servidor)
  utilidades/obra-acceso-memoria.ts # repositorio de obra_acceso en memoria (unitarias)
  seguridad.e2e-spec.ts            # /salud, token y X-Request-Id (sin MongoDB)
  roles.e2e-spec.ts                # @Roles y RolesGuard: 401/403/200 por rol y azp (controlador solo de la prueba)
  catalogo.e2e-spec.ts             # API completa con mongodb-memory-server
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
- Escrituras con varias colecciones (movimiento + stock + outbox) en una transacción de MongoDB (`transaccion.ts`). Los repositorios pasan `sesionActual()` a cada operación (`.session(sesionActual())` o `{ session: sesionActual() }`); fuera de una transacción es `null` y no cambia nada.
- Mensajes recibidos: cada módulo que escucha un tipo tiene un manejador (`ManejadorMensaje`) en su `infraestructura/` que se registra en `ConsumidorMensajes` en `onModuleInit`, valida `datos` (si faltan, `MensajeInvalidoError`) y llama a su caso de uso. El consumidor lo ejecuta dentro del inbox (`mensaje_procesado` + escrituras del caso de uso en una transacción).
- Nombres de archivo en `kebab-case` con sufijo de tipo (`.caso-uso.ts`, `.controller.ts`, `.schema.ts`, `.dto.ts`); clases en español.

## Ejemplo de punta a punta

`POST /movimientos` → `MovimientosController.registrar(dto)` → `RegistrarMovimientoCasoUso.ejecutar(entrada, usuario)` → valida acceso (`AccesoObraServicio.exigirRegistrarMovimientos`) y periodo → en transacción: `MovimientoRepositorio.guardar`, `StockRepositorio.ajustar`, `Outbox.agregar` → `201`.

## Pruebas

- Unitarias del dominio y de los casos de uso con repositorios en memoria.
- `test/*.e2e-spec.ts` con `mongodb-memory-server` (replica set) y tokens firmados con una clave de prueba.
- `npm test` y `npm run test:e2e`.
