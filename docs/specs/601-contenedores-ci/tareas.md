# 601 · Preparar el despliegue · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/601-contenedores-ci/` de la carpeta que agrupa los proyectos. Al implementarla, estas tareas reemplazan a `services/materiales/docs/specs/601-contenedores-ci/tareas.md` (eran del borrador anterior).

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [x] Aplicar «Cambios a contratos y datos» que tocan este proyecto (`docs/`, `CLAUDE.md`, `.env.example`)
- [x] Revisar que no quede ninguna dirección fija; TLS por `MONGODB_URI` y `RABBITMQ_URL` (`amqps://`); `NODE_ENV=production`
- [x] `Dockerfile` en dos etapas y `.dockerignore` (Node 24, usuario `node`, `HEALTHCHECK`, etiqueta OCI); prueba con `/salud`
- [x] Semilla: excepción `SEMILLA_DEMO=si` (solo carga); pruebas
- [ ] `.github/workflows/ci.yml`: job `prueba` (lint, pruebas unitarias y e2e con MongoDB en *replica set* como servicio, compilación) y job `imagen` (build en PR; *push* a GHCR con `sha-<7>` y `main` en `main`)
