import { ReglaNegocioError } from '../../compartido/dominio/regla-negocio.error.js';
import type { TipoMaterial } from './tipo-material.js';

/** Largo máximo del código, ya normalizado (003, criterio 3). */
export const CODIGO_LARGO_MAXIMO = 20;
/** Largo máximo del nombre (003, criterio 3). */
export const NOMBRE_LARGO_MAXIMO = 120;

/** Par nombre–valor opcional, por ejemplo «resistencia: 210 kg/cm²». */
export interface Atributo {
  nombre: string;
  valor: string;
}

/** Lo que se puede crear o cambiar de un material (todo menos el `id`). */
export interface DatosMaterial {
  codigo: string;
  nombre: string;
  tipo: TipoMaterial;
  unidad: string;
  unidadPlural: string;
  /** En bolivianos, ≥ 0. */
  precioReferencial: number;
  activo: boolean;
  atributos: Atributo[];
}

/**
 * El código se guarda en mayúsculas y sin espacios a los costados (003, diseño): « cem-ip30 »
 * es `CEM-IP30`.
 */
export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

/**
 * Material del catálogo. Desactivarlo no lo borra: deja de servir para nuevos insumos,
 * movimientos y mínimos, pero sigue en el historial (003, criterio 5).
 */
export class Material {
  readonly codigo: string;
  readonly nombre: string;
  readonly tipo: TipoMaterial;
  readonly unidad: string;
  readonly unidadPlural: string;
  readonly precioReferencial: number;
  readonly activo: boolean;
  readonly atributos: readonly Atributo[];

  constructor(
    readonly id: string,
    datos: DatosMaterial,
  ) {
    this.codigo = normalizarCodigo(datos.codigo);
    this.nombre = datos.nombre.trim();
    this.tipo = datos.tipo;
    this.unidad = datos.unidad.trim();
    this.unidadPlural = datos.unidadPlural.trim();
    this.precioReferencial = datos.precioReferencial;
    this.activo = datos.activo;
    this.atributos = datos.atributos.map(({ nombre, valor }) => ({
      nombre: nombre.trim(),
      valor: valor.trim(),
    }));
  }

  /** El mismo material con todos sus datos reemplazados (`PUT /materiales/{id}`). */
  conDatos(datos: DatosMaterial): Material {
    return new Material(this.id, datos);
  }
}

/** `409 CODIGO_MATERIAL_REPETIDO` (`docs/mensajes.md`): «Ya existe un material con el código X». */
export function codigoRepetido(codigo: string): ReglaNegocioError {
  return new ReglaNegocioError(
    'CODIGO_MATERIAL_REPETIDO',
    `Ya existe un material con el código ${codigo}`,
    409,
  );
}

/** `404 MATERIAL_NO_ENCONTRADO` (editar o fijar mínimo). */
export function materialNoEncontrado(): ReglaNegocioError {
  return new ReglaNegocioError(
    'MATERIAL_NO_ENCONTRADO',
    'No encontramos ese material en el catálogo.',
    404,
  );
}
