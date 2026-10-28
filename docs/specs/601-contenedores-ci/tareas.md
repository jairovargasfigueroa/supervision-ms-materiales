# 601 · Contenedores y CI/CD · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/601-contenedores-ci/` de la carpeta que agrupa los proyectos. Contratos: `docs/contratos.md` de este proyecto.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [ ] Variables con valores de desarrollo por defecto: `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `AUDIENCIA`, `MATERIALES_S3_*` (102) y las propuestas `MATERIALES_S3_REGION` y `RABBITMQ_URL` (`amqps://` en producción); con `MATERIALES_S3_ENDPOINT` vacío usa S3 real
- [ ] `Dockerfile` (`node:24-alpine` en dos etapas, usuario `node`, `HEALTHCHECK`) y `.dockerignore`
- [ ] `.github/workflows/ci-cd.yml`: lint y pruebas con MongoDB de servicio en *replica set*, imagen en Artifact Registry, despliegue con `deploy-cloudrun@v3` por OIDC
- [ ] Comprobar: imagen sin `.env`, usuario sin privilegios, `/salud` responde
