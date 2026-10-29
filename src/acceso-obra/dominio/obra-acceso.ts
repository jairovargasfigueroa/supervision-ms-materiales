/** Personas asignadas a una obra (ids de Keycloak). Obras es dueño; aquí hay una copia. */
export interface Asignaciones {
  residenteId: string;
  maestroId: string;
  almaceneroId: string;
  clienteId: string;
}

/**
 * Copia de las asignaciones de una obra (`obra_acceso`), que llega con `ObraRegistrada`.
 * Sirve para decidir quién puede ver o registrar en la obra.
 */
export class ObraAcceso {
  constructor(
    readonly obraId: string,
    readonly nombre: string,
    readonly asignaciones: Asignaciones,
    readonly actualizadoEn: Date,
  ) {}
}
