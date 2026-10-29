import { Inject, Injectable } from '@nestjs/common';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import {
  MATERIAL_REPOSITORIO,
  type MaterialRepositorio,
} from '../../../catalogo/aplicacion/puertos/material.repositorio.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import type { FilaStock } from '../fila-stock.js';
import {
  STOCK_REPOSITORIO,
  type StockRepositorio,
} from '../puertos/stock.repositorio.js';

/**
 * `GET /obras/{obraId}/stock` (003, 004): cada material con movimientos o mínimo en la obra,
 * ordenado por código. Si el usuario no ve la obra (o no está en `obra_acceso`),
 * `404 OBRA_NO_ENCONTRADA`.
 */
@Injectable()
export class ListarStockObraCasoUso {
  constructor(
    private readonly acceso: AccesoObraServicio,
    @Inject(STOCK_REPOSITORIO) private readonly stock: StockRepositorio,
    @Inject(MATERIAL_REPOSITORIO)
    private readonly materiales: MaterialRepositorio,
  ) {}

  async ejecutar(
    obraId: string,
    usuario: UsuarioAutenticado,
  ): Promise<FilaStock[]> {
    await this.acceso.exigirVer(obraId, usuario);
    const filas = await this.stock.listarPorObra(obraId);
    const materiales = new Map(
      (await this.materiales.buscarVarios(filas.map((f) => f.materialId))).map(
        (m) => [m.id, m],
      ),
    );
    return filas
      .flatMap((stock) => {
        // Los materiales no se borran (003, criterio 5): siempre está en el catálogo.
        const material = materiales.get(stock.materialId);
        return material ? [{ stock, material }] : [];
      })
      .sort((a, b) => compararTexto(a.material.codigo, b.material.codigo));
  }
}

/** Orden binario, igual que el de MongoDB en `GET /materiales`. */
function compararTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
