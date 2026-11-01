import { Inject, Injectable } from '@nestjs/common';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import type { ObraAcceso } from '../../../acceso-obra/dominio/obra-acceso.js';
import {
  MATERIAL_REPOSITORIO,
  type MaterialRepositorio,
} from '../../../catalogo/aplicacion/puertos/material.repositorio.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import type { EstadoStock } from '../../dominio/stock-obra.js';
import type { FilaStock } from '../fila-stock.js';
import {
  STOCK_REPOSITORIO,
  type StockRepositorio,
} from '../puertos/stock.repositorio.js';

export interface ConsultaStockObras {
  /** Sin él, todas las obras que el usuario ve. */
  obraId?: string;
  /** Estados que se devuelven. */
  estados: readonly EstadoStock[];
  /** Filas máximas. */
  limite: number;
}

/** Una fila de stock con el nombre de su obra (de `obra_acceso`). */
export interface FilaStockObra extends FilaStock {
  obraNombre: string;
}

export interface StockObras {
  filas: FilaStockObra[];
  /** Filas que cumplen el filtro, antes de recortar a `limite`. */
  total: number;
  truncado: boolean;
}

/** Primero los más críticos. */
const ORDEN_ESTADO: Record<EstadoStock, number> = { BAJO: 0, JUSTO: 1, OK: 2 };

/**
 * Stock por obra para la herramienta MCP `stock_obra` (501): el mismo stock y estado que
 * `GET /obras/{obraId}/stock` (003), de una obra o de todas las que el usuario ve, filtrado por
 * estado y ordenado `BAJO` → `JUSTO` → `OK`, luego por nombre de obra y código del material. Si
 * se pide una obra que el usuario no ve (o no está en `obra_acceso`), `404 OBRA_NO_ENCONTRADA`.
 * Solo lectura.
 */
@Injectable()
export class ConsultarStockObrasCasoUso {
  constructor(
    private readonly acceso: AccesoObraServicio,
    @Inject(STOCK_REPOSITORIO) private readonly stock: StockRepositorio,
    @Inject(MATERIAL_REPOSITORIO)
    private readonly materiales: MaterialRepositorio,
  ) {}

  async ejecutar(
    consulta: ConsultaStockObras,
    usuario: UsuarioAutenticado,
  ): Promise<StockObras> {
    const obras: ObraAcceso[] = consulta.obraId
      ? [await this.acceso.exigirVer(consulta.obraId, usuario)]
      : await this.acceso.listarVisibles(usuario);
    if (obras.length === 0) return { filas: [], total: 0, truncado: false };

    const nombres = new Map(obras.map((obra) => [obra.obraId, obra.nombre]));
    const filasStock = (
      await this.stock.listarPorObras([...nombres.keys()])
    ).filter((fila) => consulta.estados.includes(fila.estado));
    const materiales = new Map(
      (
        await this.materiales.buscarVarios([
          ...new Set(filasStock.map((fila) => fila.materialId)),
        ])
      ).map((material) => [material.id, material]),
    );
    const filas = filasStock
      .flatMap((stock) => {
        // Los materiales no se borran (003, criterio 5): siempre está en el catálogo.
        const material = materiales.get(stock.materialId);
        const obraNombre = nombres.get(stock.obraId);
        return material && obraNombre !== undefined
          ? [{ stock, material, obraNombre }]
          : [];
      })
      .sort(
        (a, b) =>
          ORDEN_ESTADO[a.stock.estado] - ORDEN_ESTADO[b.stock.estado] ||
          a.obraNombre.localeCompare(b.obraNombre, 'es') ||
          compararTexto(a.material.codigo, b.material.codigo) ||
          compararTexto(a.stock.obraId, b.stock.obraId),
      );
    return {
      filas: filas.slice(0, consulta.limite),
      total: filas.length,
      truncado: filas.length > consulta.limite,
    };
  }
}

/** Orden binario, igual que el de `GET /obras/{obraId}/stock`. */
function compararTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
