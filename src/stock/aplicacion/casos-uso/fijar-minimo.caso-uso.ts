import { Inject, Injectable } from '@nestjs/common';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import {
  MATERIAL_REPOSITORIO,
  type MaterialRepositorio,
} from '../../../catalogo/aplicacion/puertos/material.repositorio.js';
import {
  materialInactivo,
  materialNoEncontrado,
} from '../../../catalogo/dominio/material.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import { Outbox } from '../../../compartido/infraestructura/mensajeria/outbox.js';
import { Transaccion } from '../../../compartido/infraestructura/mongo/transaccion.js';
import { cruzaAlBajo } from '../../dominio/stock-obra.js';
import type { FilaStock } from '../fila-stock.js';
import {
  STOCK_REPOSITORIO,
  type StockRepositorio,
} from '../puertos/stock.repositorio.js';

/**
 * `PUT /obras/{obraId}/stock/{materialId}/minimo` (003, criterio 7): *upsert* de `stock_obra`
 * (cantidad 0 si el material no tenía fila en la obra). Orden de los errores: la obra
 * (`404 OBRA_NO_ENCONTRADA`), el material (`404 MATERIAL_NO_ENCONTRADO`) y si está activo
 * (`422 MATERIAL_INACTIVO`).
 *
 * Si el nuevo mínimo deja el stock en `BAJO` y antes no lo estaba (o no había fila), guarda
 * `StockBajo` en el outbox en la misma transacción que el *upsert* (lo usa la capa 2).
 */
@Injectable()
export class FijarMinimoCasoUso {
  constructor(
    private readonly acceso: AccesoObraServicio,
    @Inject(STOCK_REPOSITORIO) private readonly stock: StockRepositorio,
    @Inject(MATERIAL_REPOSITORIO)
    private readonly materiales: MaterialRepositorio,
    private readonly transaccion: Transaccion,
    private readonly outbox: Outbox,
  ) {}

  async ejecutar(
    obraId: string,
    materialId: string,
    minimo: number,
    usuario: UsuarioAutenticado,
    correlacionId?: string,
  ): Promise<FilaStock> {
    await this.acceso.exigirVer(obraId, usuario);
    const material = await this.materiales.buscar(materialId);
    if (!material) throw materialNoEncontrado();
    if (!material.activo) throw materialInactivo();

    const actual = await this.transaccion.ejecutar(async () => {
      const cambio = await this.stock.fijarMinimo(
        obraId,
        materialId,
        minimo,
        new Date(),
      );
      if (cruzaAlBajo(cambio.anterior, cambio.actual)) {
        await this.outbox.agregar(
          'StockBajo',
          {
            obraId,
            materialId,
            cantidad: cambio.actual.cantidad,
            minimo: cambio.actual.minimo,
          },
          correlacionId,
        );
      }
      return cambio.actual;
    });
    return { stock: actual, material };
  }
}
