import type { Material } from '../../catalogo/dominio/material.js';
import type { StockObra } from '../dominio/stock-obra.js';

/** Una fila de «Stock por obra»: el stock del material y sus datos del catálogo. */
export interface FilaStock {
  stock: StockObra;
  material: Material;
}
