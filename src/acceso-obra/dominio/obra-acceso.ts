/** Personas asignadas a una obra (ids de Keycloak). Obras es dueño; aquí hay una copia. */
export interface Asignaciones {
  residenteId: string;
  maestroId: string;
  almaceneroId: string;
  clienteId: string;
}

/** Roles que ven todas las obras (convenciones, «Visibilidad de obras»). */
const VEN_TODAS: readonly string[] = ['admin', 'gerente'];

/**
 * Copia de las asignaciones de una obra (`obra_acceso`), que llega con `ObraRegistrada`.
 * Sirve para decidir quién puede ver o registrar en la obra.
 *
 * `roles` son siempre los roles efectivos del usuario (según `azp`), nunca los del token tal cual.
 */
export class ObraAcceso {
  constructor(
    readonly obraId: string,
    readonly nombre: string,
    readonly asignaciones: Asignaciones,
    readonly actualizadoEn: Date,
  ) {}

  /**
   * `admin` y `gerente` ven todas; `residente`, `maestro` y `almacenero`, las que tienen asignadas
   * con ese rol; `cliente`, las suyas.
   */
  puedeVer(usuarioId: string, roles: readonly string[]): boolean {
    if (roles.some((rol) => VEN_TODAS.includes(rol))) return true;
    const { residenteId, maestroId, almaceneroId, clienteId } =
      this.asignaciones;
    return (
      (roles.includes('residente') && residenteId === usuarioId) ||
      (roles.includes('maestro') && maestroId === usuarioId) ||
      (roles.includes('almacenero') && almaceneroId === usuarioId) ||
      (roles.includes('cliente') && clienteId === usuarioId)
    );
  }

  /** Solo el almacenero asignado registra movimientos de material en la obra (004). */
  puedeRegistrarMovimientos(
    usuarioId: string,
    roles: readonly string[],
  ): boolean {
    return (
      roles.includes('almacenero') &&
      this.asignaciones.almaceneroId === usuarioId
    );
  }
}
