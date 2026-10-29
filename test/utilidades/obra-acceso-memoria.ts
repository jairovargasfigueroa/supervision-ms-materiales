import type { ObraAccesoRepositorio } from '../../src/acceso-obra/aplicacion/puertos/obra-acceso.repositorio.js';
import type { ObraAcceso } from '../../src/acceso-obra/dominio/obra-acceso.js';

/** Repositorio de `obra_acceso` en memoria para las pruebas unitarias. */
export class ObraAccesoRepositorioMemoria implements ObraAccesoRepositorio {
  readonly obras = new Map<string, ObraAcceso>();

  guardar(obra: ObraAcceso): Promise<void> {
    this.obras.set(obra.obraId, obra);
    return Promise.resolve();
  }

  buscar(obraId: string): Promise<ObraAcceso | null> {
    return Promise.resolve(this.obras.get(obraId) ?? null);
  }

  buscarVarias(obraIds: readonly string[]): Promise<ObraAcceso[]> {
    return Promise.resolve(
      obraIds.flatMap((id) => {
        const obra = this.obras.get(id);
        return obra ? [obra] : [];
      }),
    );
  }
}
