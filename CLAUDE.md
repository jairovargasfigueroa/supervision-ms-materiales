# Servicio Materiales

Microservicio dueño del catálogo de materiales, el stock por obra y los movimientos (ingresos y salidas). Participa en la saga «aprobar planilla» cerrando los consumos del periodo.

Parte de la «Plataforma de supervisión de obras». Si existe `../../CLAUDE.md` (carpeta que agrupa todos los proyectos), léelo primero: tiene las reglas transversales, el plan y los contratos generales.

**Estado:** esqueleto. No implementes una funcionalidad sin su especificación aprobada en `docs/specs/`.

## Stack

- NestJS 12 · TypeScript (módulos ES: imports con extensión `.js`)
- MongoDB con Mongoose (`@nestjs/mongoose`) · configuración con `@nestjs/config`
- Pruebas con Vitest · lint con oxlint · formato con Prettier
- Puerto: `8082` (`PORT`)

## Comandos

```sh
npm install
npm run start:dev    # levantar en modo desarrollo
npm test             # pruebas unitarias
npm run test:e2e     # pruebas de punta a punta
npm run lint
```

Configuración local: copiar `.env.example` a `.env` y completar. **`.env` nunca se sube.**

## Arquitectura: Clean Architecture

Estructura prevista por módulo (`catalogo`, `stock`, `movimientos`):

```
src/<modulo>/
  dominio/          entidades y reglas; sin NestJS ni Mongoose
  aplicacion/       casos de uso e interfaces de repositorios
  infraestructura/  esquemas Mongoose, repositorios, mensajería
  presentacion/     controladores REST y DTOs con validación
```

- Las dependencias apuntan hacia adentro: `presentacion` e `infraestructura` dependen de `aplicacion`, y esta de `dominio`.
- Se registran hechos (`INGRESO`, `SALIDA`); el stock se recalcula, nunca se escribe a mano.

## Reglas del proyecto

- Lo que este servicio guarda está en `docs/datos.md`; lo que expone y escucha, en `docs/contratos.md`.
- Cada movimiento llega con un `_id` creado en el celular: si ya existe, se devuelve el existente sin volver a sumarlo.
- Una salida que supera el stock se acepta y genera una alerta.
- Si el stock queda bajo el mínimo, se publica el evento «stock bajo».
- Los movimientos de un periodo cerrado no se modifican.

## Documentación

- `docs/estructura.md`: **librerías permitidas y estructura exacta de carpetas y archivos. Obligatorio leerlo antes de escribir código.**
- `docs/servicio.md`: responsabilidades, casos de uso y qué no hace.
- `docs/datos.md`: colecciones.
- `docs/contratos.md`: REST, eventos y herramientas MCP.
- `docs/specs/`: especificaciones por funcionalidad (`requisitos.md`, `diseno.md`, `tareas.md`).

## Commits

Conventional Commits en español e imperativo (`feat(stock): agrega alerta de stock bajo`). Sin coautoría ni firmas de la IA.

Git Flow: ramas `feat/`, `fix/`, `docs/`… desde `develop`, que entran por *pull request*; nunca hagas *push* a `main` ni a `develop` (están protegidas). El agente crea y fusiona los PR (merge normal, sin squash) hacia `develop` cuando todas las pruebas pasan. Detalle y definición de terminado: `docs/flujo-trabajo.md` del repo `supervision-docs`.
