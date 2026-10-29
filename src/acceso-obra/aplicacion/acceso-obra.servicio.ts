import { Inject, Injectable } from '@nestjs/common';
import { ReglaNegocioError } from '../../compartido/dominio/regla-negocio.error.js';
import { rolesEfectivos } from '../../compartido/infraestructura/auth/roles-efectivos.js';
import type { UsuarioAutenticado } from '../../compartido/infraestructura/auth/usuario-autenticado.js';
import type { ObraAcceso } from '../dominio/obra-acceso.js';
import {
  OBRA_ACCESO_REPOSITORIO,
  type ObraAccesoRepositorio,
} from './puertos/obra-acceso.repositorio.js';

/**
 * Quién puede ver o registrar en una obra según `obra_acceso` (convenciones, «Visibilidad de
 * obras»), con los roles efectivos del usuario (`rolesEfectivos(roles, azp)`). Lo usan los casos
 * de uso de stock (003), movimientos (004), consumos (006) y el resumen del tablero (009).
 *
 * Orden de las respuestas (convenciones): el `403 SIN_PERMISO` por rol lo da antes `@Roles()` en
 * la ruta; aquí, si el rol sí puede pero el usuario no ve la obra (o la obra no está en
 * `obra_acceso`), `404 OBRA_NO_ENCONTRADA`, igual que si no existiera.
 */
@Injectable()
export class AccesoObraServicio {
  constructor(
    @Inject(OBRA_ACCESO_REPOSITORIO)
    private readonly obras: ObraAccesoRepositorio,
  ) {}

  async puedeVer(
    obraId: string,
    usuario: UsuarioAutenticado,
  ): Promise<boolean> {
    const obra = await this.obras.buscar(obraId);
    return obra?.puedeVer(usuario.id, efectivos(usuario)) ?? false;
  }

  /** Devuelve la obra si el usuario la ve; si no, `404 OBRA_NO_ENCONTRADA`. */
  async exigirVer(
    obraId: string,
    usuario: UsuarioAutenticado,
  ): Promise<ObraAcceso> {
    const obra = await this.obras.buscar(obraId);
    if (!obra?.puedeVer(usuario.id, efectivos(usuario))) {
      throw obraNoEncontrada();
    }
    return obra;
  }

  /**
   * Para `POST /movimientos` (004): solo el almacenero asignado. Sin el rol `almacenero`,
   * `403 SIN_PERMISO`; con el rol pero sin estar asignado (o sin la obra), `404 OBRA_NO_ENCONTRADA`.
   */
  async exigirRegistrarMovimientos(
    obraId: string,
    usuario: UsuarioAutenticado,
  ): Promise<ObraAcceso> {
    const roles = efectivos(usuario);
    if (!roles.includes('almacenero')) {
      throw new ReglaNegocioError(
        'SIN_PERMISO',
        'Tu rol no permite esta acción.',
        403,
      );
    }
    const obra = await this.obras.buscar(obraId);
    if (!obra?.puedeRegistrarMovimientos(usuario.id, roles)) {
      throw obraNoEncontrada();
    }
    return obra;
  }

  /** Las obras de la lista que el usuario ve, sin repetir y en el mismo orden (009). */
  async filtrarVisibles(
    obraIds: readonly string[],
    usuario: UsuarioAutenticado,
  ): Promise<string[]> {
    const unicas = [...new Set(obraIds)];
    const roles = efectivos(usuario);
    const visibles = new Set(
      (await this.obras.buscarVarias(unicas))
        .filter((obra) => obra.puedeVer(usuario.id, roles))
        .map((obra) => obra.obraId),
    );
    return unicas.filter((id) => visibles.has(id));
  }
}

function efectivos(usuario: UsuarioAutenticado): string[] {
  return rolesEfectivos(usuario.roles, usuario.azp);
}

function obraNoEncontrada(): ReglaNegocioError {
  return new ReglaNegocioError('OBRA_NO_ENCONTRADA', 'Obra no encontrada', 404);
}
