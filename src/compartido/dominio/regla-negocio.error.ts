/**
 * Error de una regla del negocio. `problem-details.filter.ts` lo convierte en Problem Details
 * con su `codigo` (catálogo en `docs/mensajes.md` de la carpeta general).
 */
export class ReglaNegocioError extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly status: number,
  ) {
    super(mensaje);
    this.name = 'ReglaNegocioError';
  }
}
