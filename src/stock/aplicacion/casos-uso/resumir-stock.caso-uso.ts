import { Inject, Injectable } from '@nestjs/common';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import {
  resumirStock,
  type ResumenStockObra,
} from '../../dominio/stock-obra.js';
import {
  STOCK_REPOSITORIO,
  type StockRepositorio,
} from '../puertos/stock.repositorio.js';

/**
 * `GET /stock/resumen?obraIds=` (009): cuántos materiales están `BAJO` en cada obra pedida. Solo
 * las obras que el usuario ve (`AccesoObraServicio.filtrarVisibles`): las demás, y las que no están
 * en `obra_acceso`, se omiten sin error. Sin repetir y en el orden pedido.
 */
@Injectable()
export class ResumirStockCasoUso {
  constructor(
    private readonly acceso: AccesoObraServicio,
    @Inject(STOCK_REPOSITORIO) private readonly stock: StockRepositorio,
  ) {}

  async ejecutar(
    obraIds: readonly string[],
    usuario: UsuarioAutenticado,
  ): Promise<ResumenStockObra[]> {
    const visibles = await this.acceso.filtrarVisibles(obraIds, usuario);
    if (visibles.length === 0) return [];
    return resumirStock(visibles, await this.stock.listarPorObras(visibles));
  }
}
