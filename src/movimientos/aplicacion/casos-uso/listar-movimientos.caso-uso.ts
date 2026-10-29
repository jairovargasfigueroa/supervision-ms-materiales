import { Inject, Injectable } from '@nestjs/common';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import {
  type CriteriosPagina,
  type Pagina,
  validarPaginacion,
} from '../../../compartido/dominio/paginacion.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import type { Movimiento } from '../../dominio/movimiento.js';
import {
  type FiltroMovimientos,
  MOVIMIENTO_REPOSITORIO,
  type MovimientoRepositorio,
  type OrdenMovimiento,
} from '../puertos/movimiento.repositorio.js';

/**
 * `GET /obras/{obraId}/movimientos?periodo=` (004): movimientos de la obra, paginados (`tamano`
 * mayor a 100 → `400 PAGINACION_INVALIDA`). Si el usuario no ve la obra (o no está en
 * `obra_acceso`), `404 OBRA_NO_ENCONTRADA`.
 */
@Injectable()
export class ListarMovimientosCasoUso {
  constructor(
    private readonly acceso: AccesoObraServicio,
    @Inject(MOVIMIENTO_REPOSITORIO)
    private readonly movimientos: MovimientoRepositorio,
  ) {}

  async ejecutar(
    obraId: string,
    filtro: FiltroMovimientos,
    criterios: CriteriosPagina<OrdenMovimiento>,
    usuario: UsuarioAutenticado,
  ): Promise<Pagina<Movimiento>> {
    validarPaginacion(criterios);
    await this.acceso.exigirVer(obraId, usuario);
    return this.movimientos.listar(obraId, filtro, criterios);
  }
}
