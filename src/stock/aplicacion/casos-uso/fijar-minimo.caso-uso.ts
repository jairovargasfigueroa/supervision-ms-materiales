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
import { Transaccion } from '../../../compartido/infraestructura/mongo/transaccion.js';
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
 */
@Injectable()
export class FijarMinimoCasoUso {
  constructor(
    private readonly acceso: AccesoObraServicio,
    @Inject(STOCK_REPOSITORIO) private readonly stock: StockRepositorio,
    @Inject(MATERIAL_REPOSITORIO)
    private readonly materiales: MaterialRepositorio,
    private readonly transaccion: Transaccion,
  ) {}

  async ejecutar(
    obraId: string,
    materialId: string,
    minimo: number,
    usuario: UsuarioAutenticado,
  ): Promise<FilaStock> {
    await this.acceso.exigirVer(obraId, usuario);
    const material = await this.materiales.buscar(materialId);
    if (!material) throw materialNoEncontrado();
    if (!material.activo) throw materialInactivo();

    const { actual } = await this.transaccion.ejecutar(() =>
      this.stock.fijarMinimo(obraId, materialId, minimo, new Date()),
    );
    return { stock: actual, material };
  }
}
