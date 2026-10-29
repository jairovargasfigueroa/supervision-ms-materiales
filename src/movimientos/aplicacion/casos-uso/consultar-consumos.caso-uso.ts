import { Inject, Injectable } from '@nestjs/common';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import type { ConsumoPartida } from '../../dominio/consumo.js';
import {
  MOVIMIENTO_REPOSITORIO,
  type MovimientoRepositorio,
} from '../puertos/movimiento.repositorio.js';

/**
 * `GET /obras/{obraId}/consumos?periodo=` (006): material usado en la obra durante el periodo,
 * sumando solo las salidas, por partida y material. Si el usuario no ve la obra (o no está en
 * `obra_acceso`), `404 OBRA_NO_ENCONTRADA`; el rol lo filtra antes `@Roles()` en la ruta.
 */
@Injectable()
export class ConsultarConsumosCasoUso {
  constructor(
    private readonly acceso: AccesoObraServicio,
    @Inject(MOVIMIENTO_REPOSITORIO)
    private readonly movimientos: MovimientoRepositorio,
  ) {}

  async ejecutar(
    obraId: string,
    periodo: string,
    usuario: UsuarioAutenticado,
  ): Promise<ConsumoPartida[]> {
    await this.acceso.exigirVer(obraId, usuario);
    return this.movimientos.sumarSalidas(obraId, periodo);
  }
}
