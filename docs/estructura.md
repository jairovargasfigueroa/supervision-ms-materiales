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
      mensajeria/   mensajeria.module.ts, rabbit.cliente.ts, sobre.ts, outbox.schema.ts, outbox.publicador.ts, inbox.schema.ts
      mongo/        transaccion.ts (ayuda para sesiones/transacciones)
  salud/                           # GET /salud (@Publico, no toca MongoDB ni RabbitMQ)
    presentacion/   salud.controller.ts
    salud.module.ts
  acceso-obra/                     # copia de asignaciones (obra_acceso)
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
  seguridad.e2e-spec.ts            # /salud, token y X-Request-Id (sin MongoDB)
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
- Escrituras con varias colecciones (movimiento + stock + outbox) en una transacción de MongoDB (`transaccion.ts`).
- Nombres de archivo en `kebab-case` con sufijo de tipo (`.caso-uso.ts`, `.controller.ts`, `.schema.ts`, `.dto.ts`); clases en español.

## Ejemplo de punta a punta

`POST /movimientos` → `MovimientosController.registrar(dto)` → `RegistrarMovimientoCasoUso.ejecutar(entrada, usuario)` → valida acceso (`AccesoObraServicio`) y periodo → en transacción: `MovimientoRepositorio.guardar`, `StockRepositorio.ajustar`, `Outbox.agregar` → `201`.

## Pruebas

- Unitarias del dominio y de los casos de uso con repositorios en memoria.
- `test/*.e2e-spec.ts` con `mongodb-memory-server` (replica set) y tokens firmados con una clave de prueba.
- `npm test` y `npm run test:e2e`.
