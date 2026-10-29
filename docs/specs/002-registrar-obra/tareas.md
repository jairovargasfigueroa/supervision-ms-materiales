# 002 · Registrar obra · tareas de `services/materiales`

Requisitos y diseño: `docs/specs/002-registrar-obra/` de la carpeta que agrupa los proyectos. Contratos: `docs/contratos.md` de este proyecto.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [x] Conexión a RabbitMQ (cola `materiales`, enlaces a las claves que escucha) e inbox `mensaje_procesado`
- [ ] Esquema `obra_acceso` y consumidor de `ObraRegistrada` idempotente
- [ ] Servicio `AccesoObra` (quién puede ver o registrar en una obra) para usar en 003 y 004
- [ ] Pruebas del consumidor y del servicio de acceso
