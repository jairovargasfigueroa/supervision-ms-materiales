# 102 · Fotos sin señal y mala conexión · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/102-fotos-mala-conexion/` de la carpeta que agrupa los proyectos. Contratos: `docs/contratos.md` de este proyecto.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [ ] Cliente S3 del AWS SDK v3 con URL firmada (`MATERIALES_S3_*`, *path-style*) en `infraestructura/`
- [ ] `POST /obras/{obraId}/notas-remision/url-subida` (almacenero asignado o admin; clave `notas-remision/{obraId}/{movimientoId}.jpg`)
- [ ] `PUT /movimientos/{id}/nota-remision/foto`: validación de tipo y clave, idempotencia, permitido con periodo cerrado
- [ ] `notaRemision { numero, urlFoto }` en `GET /obras/{obraId}/movimientos`
- [ ] Pruebas de la spec
