import {
  TIPOS_MATERIAL,
  type TipoMaterial,
} from '../catalogo/dominio/tipo-material.js';
import type { EstadoStock } from '../stock/dominio/stock-obra.js';
import {
  TIPOS_MOVIMIENTO,
  type TipoMovimiento,
} from '../movimientos/dominio/movimiento.js';
import { ESTADOS_CIERRE } from '../cierres/dominio/cierre-periodo.js';

/**
 * Datos de prueba de Materiales (`materiales.json`): copia de las secciones 5, 6 y 9 de
 * `docs/datos-prueba.md` (fuente única). Las fechas van con la notación relativa a D
 * (`fecha-relativa.ts`). Lo derivado (`periodo`, `supera_stock`, `cerrado` y la cantidad de
 * `stock_obra`) no está aquí: lo calcula la carga. `stock[].cantidadEsperada`,
 * `stock[].estadoEsperado` y `movimientos[].stock` son la verificación (columna «Stock» y tabla
 * de estado final del documento).
 */
export interface DatosSemilla {
  /** `sub` de quien registró los movimientos (almacenero1). */
  registradoPor: string;
  materiales: MaterialSemilla[];
  obraAcceso: ObraAccesoSemilla[];
  stock: StockSemilla[];
  movimientos: MovimientoSemilla[];
  cierres: CierreSemilla[];
}

export interface MaterialSemilla {
  id: string;
  codigo: string;
  nombre: string;
  tipo: TipoMaterial;
  unidad: string;
  unidadPlural: string;
  precioReferencial: number;
  /** Proveedor de Finanzas (201); `null` si no tiene. */
  proveedorHabitualId: string | null;
  atributos: { nombre: string; valor: string }[];
  activo: boolean;
}

export interface ObraAccesoSemilla {
  obraId: string;
  nombre: string;
  residenteId: string;
  maestroId: string;
  almaceneroId: string;
  clienteId: string;
}

export interface StockSemilla {
  obraId: string;
  /** Código del material (`CEM-IP30`). */
  material: string;
  minimo: number;
  cantidadEsperada: number;
  estadoEsperado: EstadoStock;
}

export interface MovimientoSemilla {
  id: string;
  obraId: string;
  tipo: TipoMovimiento;
  /** Código del material (`CEM-IP30`). */
  material: string;
  cantidad: number;
  /** Obligatoria en salidas; `null` en ingresos. */
  partidaId: string | null;
  /** Instante relativo a D (`M-1/09 10:00`, `D-2 10:00`). */
  registradoEn: string;
  /** Número de la nota de remisión de un ingreso (`NR-10001`); `null` en salidas. */
  notaRemision: string | null;
  /** Stock del material en la obra después del movimiento (verificación). */
  stock: number;
}

export interface CierreSemilla {
  obraId: string;
  /** Periodo relativo a D (`M-3`). */
  periodo: string;
  planillaId: string;
  estado: (typeof ESTADOS_CIERRE)[number];
  /** Instante relativo a D (`D-40 10:00`). */
  cerradoEn: string;
}

/** El archivo de datos no tiene la forma esperada. */
export class DatosSemillaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'DatosSemillaError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ESTADOS_STOCK = ['BAJO', 'JUSTO', 'OK'] as const;

/** Comprueba la forma del archivo de datos (tipos, ids y valores permitidos) y lo devuelve tipado. */
export function leerDatosSemilla(json: unknown): DatosSemilla {
  const raiz = objeto(json, 'raíz');
  return {
    registradoPor: uuid(raiz, 'registradoPor', 'raíz'),
    materiales: lista(raiz, 'materiales').map((valor, i) => {
      const lugar = `materiales[${i}]`;
      const m = objeto(valor, lugar);
      return {
        id: uuid(m, 'id', lugar),
        codigo: texto(m, 'codigo', lugar),
        nombre: texto(m, 'nombre', lugar),
        tipo: unoDe(m, 'tipo', TIPOS_MATERIAL, lugar),
        unidad: texto(m, 'unidad', lugar),
        unidadPlural: texto(m, 'unidadPlural', lugar),
        precioReferencial: numero(m, 'precioReferencial', lugar),
        proveedorHabitualId:
          m.proveedorHabitualId === null
            ? null
            : uuid(m, 'proveedorHabitualId', lugar),
        atributos: lista(m, 'atributos', lugar).map((a, j) => {
          const atributo = objeto(a, `${lugar}.atributos[${j}]`);
          return {
            nombre: texto(atributo, 'nombre', `${lugar}.atributos[${j}]`),
            valor: texto(atributo, 'valor', `${lugar}.atributos[${j}]`),
          };
        }),
        activo: booleano(m, 'activo', lugar),
      };
    }),
    obraAcceso: lista(raiz, 'obraAcceso').map((valor, i) => {
      const lugar = `obraAcceso[${i}]`;
      const o = objeto(valor, lugar);
      return {
        obraId: uuid(o, 'obraId', lugar),
        nombre: texto(o, 'nombre', lugar),
        residenteId: uuid(o, 'residenteId', lugar),
        maestroId: uuid(o, 'maestroId', lugar),
        almaceneroId: uuid(o, 'almaceneroId', lugar),
        clienteId: uuid(o, 'clienteId', lugar),
      };
    }),
    stock: lista(raiz, 'stock').map((valor, i) => {
      const lugar = `stock[${i}]`;
      const s = objeto(valor, lugar);
      return {
        obraId: uuid(s, 'obraId', lugar),
        material: texto(s, 'material', lugar),
        minimo: numero(s, 'minimo', lugar),
        cantidadEsperada: numero(s, 'cantidadEsperada', lugar),
        estadoEsperado: unoDe(s, 'estadoEsperado', ESTADOS_STOCK, lugar),
      };
    }),
    movimientos: lista(raiz, 'movimientos').map((valor, i) => {
      const lugar = `movimientos[${i}]`;
      const m = objeto(valor, lugar);
      return {
        id: uuid(m, 'id', lugar),
        obraId: uuid(m, 'obraId', lugar),
        tipo: unoDe(m, 'tipo', TIPOS_MOVIMIENTO, lugar),
        material: texto(m, 'material', lugar),
        cantidad: numero(m, 'cantidad', lugar),
        partidaId: m.partidaId === null ? null : uuid(m, 'partidaId', lugar),
        registradoEn: texto(m, 'registradoEn', lugar),
        notaRemision:
          m.notaRemision === null ? null : texto(m, 'notaRemision', lugar),
        stock: numero(m, 'stock', lugar),
      };
    }),
    cierres: lista(raiz, 'cierres').map((valor, i) => {
      const lugar = `cierres[${i}]`;
      const c = objeto(valor, lugar);
      return {
        obraId: uuid(c, 'obraId', lugar),
        periodo: texto(c, 'periodo', lugar),
        planillaId: uuid(c, 'planillaId', lugar),
        estado: unoDe(c, 'estado', ESTADOS_CIERRE, lugar),
        cerradoEn: texto(c, 'cerradoEn', lugar),
      };
    }),
  };
}

type Objeto = Record<string, unknown>;

function objeto(valor: unknown, lugar: string): Objeto {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new DatosSemillaError(`${lugar}: se esperaba un objeto`);
  }
  return valor as Objeto;
}

function lista(o: Objeto, campo: string, lugar = 'raíz'): unknown[] {
  const valor = o[campo];
  if (!Array.isArray(valor)) {
    throw new DatosSemillaError(`${lugar}.${campo}: se esperaba una lista`);
  }
  return valor;
}

function texto(o: Objeto, campo: string, lugar: string): string {
  const valor = o[campo];
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new DatosSemillaError(`${lugar}.${campo}: se esperaba un texto`);
  }
  return valor;
}

function uuid(o: Objeto, campo: string, lugar: string): string {
  const valor = texto(o, campo, lugar);
  if (!UUID.test(valor)) {
    throw new DatosSemillaError(`${lugar}.${campo}: «${valor}» no es un UUID`);
  }
  return valor;
}

function numero(o: Objeto, campo: string, lugar: string): number {
  const valor = o[campo];
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new DatosSemillaError(`${lugar}.${campo}: se esperaba un número`);
  }
  return valor;
}

function booleano(o: Objeto, campo: string, lugar: string): boolean {
  const valor = o[campo];
  if (typeof valor !== 'boolean') {
    throw new DatosSemillaError(`${lugar}.${campo}: se esperaba true o false`);
  }
  return valor;
}

function unoDe<T extends string>(
  o: Objeto,
  campo: string,
  permitidos: readonly T[],
  lugar: string,
): T {
  const valor = o[campo];
  if (!permitidos.includes(valor as T)) {
    throw new DatosSemillaError(
      `${lugar}.${campo}: «${String(valor)}» no es uno de ${permitidos.join(', ')}`,
    );
  }
  return valor as T;
}
