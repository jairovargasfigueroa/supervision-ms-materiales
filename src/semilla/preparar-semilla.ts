import { sumarCantidades } from '../compartido/dominio/cantidad.js';
import { periodoDe, ZONA_NEGOCIO } from '../compartido/dominio/periodo.js';
import type { EstadoCierre } from '../cierres/dominio/cierre-periodo.js';
import {
  ajusteDeStock,
  superaElStock,
  type TipoMovimiento,
} from '../movimientos/dominio/movimiento.js';
import { calcularEstado } from '../stock/dominio/stock-obra.js';
import type { DatosSemilla, MaterialSemilla } from './datos-semilla.js';
import {
  instanteEnLaPaz,
  resolver,
  resolverInstante,
  resolverPeriodo,
} from './fecha-relativa.js';

/** Datos de prueba con las fechas resueltas para D y los derivados calculados, listos para guardar. */
export interface SemillaPreparada {
  d: string;
  materiales: MaterialSemilla[];
  obraAcceso: ObraAccesoPreparada[];
  /** En el orden en que se aplicaron (fecha; ingresos antes que salidas el mismo día). */
  movimientos: MovimientoPreparado[];
  stock: StockPreparado[];
  cierres: CierrePreparado[];
}

export interface ObraAccesoPreparada {
  obraId: string;
  nombre: string;
  residenteId: string;
  maestroId: string;
  almaceneroId: string;
  clienteId: string;
  actualizadoEn: Date;
}

export interface MovimientoPreparado {
  id: string;
  obraId: string;
  materialId: string;
  tipo: TipoMovimiento;
  cantidad: number;
  partidaId: string | null;
  periodo: string;
  cerrado: boolean;
  superaStock: boolean;
  registradoPor: string;
  registradoEn: Date;
  notaRemision: string | null;
}

export interface StockPreparado {
  obraId: string;
  materialId: string;
  cantidad: number;
  minimo: number;
  actualizadoEn: Date;
}

export interface CierrePreparado {
  obraId: string;
  periodo: string;
  planillaId: string;
  estado: EstadoCierre;
  cerradoEn: Date;
}

/** Los datos no cuadran con las reglas o con la verificación del documento: no se carga nada. */
export class SemillaInvalidaError extends Error {
  constructor(readonly problemas: string[]) {
    super(
      `Los datos de prueba no cuadran (no se cargó nada):\n- ${problemas.join('\n- ')}`,
    );
    this.name = 'SemillaInvalidaError';
  }
}

const diaLaPaz = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Resuelve las fechas para D y calcula lo derivado con las reglas del dominio:
 *
 * - `periodo` = mes de `registrado_en` en La Paz (`periodoDe`);
 * - `cerrado` = hay un cierre `CERRADO` de esa obra y periodo;
 * - los movimientos se aplican en orden de fecha, con los ingresos antes que las salidas el mismo
 *   día: `supera_stock` (`superaElStock`) y `stock_obra.cantidad` = ingresos − salidas;
 * - `stock_obra.actualizado_en` = fecha del último movimiento; `obra_acceso.actualizado_en` = D.
 *
 * Falla (`SemillaInvalidaError`, con todos los problemas juntos) si un dato no respeta las reglas
 * o si el stock después de cada movimiento, la cantidad final o el estado de cada fila no
 * coinciden con los del documento (`docs/datos-prueba.md`, sección 9).
 */
export function prepararSemilla(
  datos: DatosSemilla,
  d: string,
): SemillaPreparada {
  const problemas: string[] = [];
  // Valida D antes que nada (lanza FechaRelativaError si está mal).
  resolver('D', d);
  const [anio, mes, dia] = d.split('-').map(Number);
  const inicioD = instanteEnLaPaz(anio, mes, dia);

  const porCodigo = new Map<string, MaterialSemilla>();
  const idsMaterial = new Set<string>();
  for (const material of datos.materiales) {
    if (porCodigo.has(material.codigo)) {
      problemas.push(`material ${material.codigo} repetido`);
    }
    if (idsMaterial.has(material.id)) {
      problemas.push(`id de material ${material.id} repetido`);
    }
    porCodigo.set(material.codigo, material);
    idsMaterial.add(material.id);
  }
  const materialActivo = (codigo: string, lugar: string) => {
    const material = porCodigo.get(codigo);
    if (!material) {
      problemas.push(`${lugar}: el material ${codigo} no está en el catálogo`);
      return null;
    }
    if (!material.activo) {
      problemas.push(`${lugar}: el material ${codigo} está desactivado`);
    }
    return material;
  };

  const obras = new Set<string>();
  for (const obra of datos.obraAcceso) {
    if (obras.has(obra.obraId)) {
      problemas.push(`obra_acceso ${obra.obraId} repetida`);
    }
    obras.add(obra.obraId);
  }
  const exigirObra = (obraId: string, lugar: string) => {
    if (!obras.has(obraId)) {
      problemas.push(`${lugar}: la obra ${obraId} no está en obra_acceso`);
    }
  };

  const cierres: CierrePreparado[] = [];
  const cerrados = new Set<string>();
  for (const cierre of datos.cierres) {
    const lugar = `cierre ${cierre.obraId} ${cierre.periodo}`;
    exigirObra(cierre.obraId, lugar);
    const periodo = resolverPeriodo(cierre.periodo, d);
    const clave = `${cierre.obraId}:${periodo}`;
    if (cierres.some((c) => `${c.obraId}:${c.periodo}` === clave)) {
      problemas.push(`${lugar}: hay dos cierres para el mismo periodo`);
    }
    if (cierre.estado === 'CERRADO') cerrados.add(clave);
    cierres.push({
      obraId: cierre.obraId,
      periodo,
      planillaId: cierre.planillaId,
      estado: cierre.estado,
      cerradoEn: resolverInstante(cierre.cerradoEn, d),
    });
  }

  // Orden de aplicación: día en La Paz, ingresos antes que salidas, hora y orden del archivo.
  const idsMovimiento = new Set<string>();
  const ordenados = datos.movimientos
    .map((movimiento, indice) => {
      const registradoEn = resolverInstante(movimiento.registradoEn, d);
      return {
        movimiento,
        indice,
        registradoEn,
        dia: diaLaPaz.format(registradoEn),
      };
    })
    .sort(
      (a, b) =>
        a.dia.localeCompare(b.dia) ||
        Number(a.movimiento.tipo === 'SALIDA') -
          Number(b.movimiento.tipo === 'SALIDA') ||
        a.registradoEn.getTime() - b.registradoEn.getTime() ||
        a.indice - b.indice,
    );

  const cantidades = new Map<string, number>();
  const ultimos = new Map<string, Date>();
  const movimientos: MovimientoPreparado[] = [];
  for (const { movimiento, registradoEn } of ordenados) {
    const lugar = `movimiento ${movimiento.id}`;
    if (idsMovimiento.has(movimiento.id)) {
      problemas.push(`${lugar}: id repetido`);
    }
    idsMovimiento.add(movimiento.id);
    exigirObra(movimiento.obraId, lugar);
    const material = materialActivo(movimiento.material, lugar);
    if (!material) continue;
    if (movimiento.cantidad <= 0) {
      problemas.push(`${lugar}: la cantidad debe ser mayor que 0`);
    }
    if (movimiento.tipo === 'SALIDA' && !movimiento.partidaId) {
      problemas.push(`${lugar}: una salida necesita su partida`);
    }
    if (movimiento.tipo === 'INGRESO' && movimiento.partidaId) {
      problemas.push(`${lugar}: un ingreso no lleva partida`);
    }
    if (movimiento.tipo === 'SALIDA' && movimiento.notaRemision) {
      problemas.push(`${lugar}: una salida no lleva nota de remisión`);
    }

    const clave = `${movimiento.obraId}:${material.id}`;
    const previo = cantidades.get(clave) ?? 0;
    const despues = sumarCantidades(
      previo,
      ajusteDeStock(movimiento.tipo, movimiento.cantidad),
    );
    if (despues !== movimiento.stock) {
      problemas.push(
        `${lugar} (${movimiento.material}): el stock queda en ${despues} y el documento dice ${movimiento.stock}`,
      );
    }
    cantidades.set(clave, despues);
    ultimos.set(clave, registradoEn);

    const periodo = periodoDe(registradoEn);
    movimientos.push({
      id: movimiento.id,
      obraId: movimiento.obraId,
      materialId: material.id,
      tipo: movimiento.tipo,
      cantidad: movimiento.cantidad,
      partidaId: movimiento.partidaId,
      periodo,
      cerrado: cerrados.has(`${movimiento.obraId}:${periodo}`),
      superaStock: superaElStock(movimiento.tipo, movimiento.cantidad, previo),
      registradoPor: datos.registradoPor,
      registradoEn,
      notaRemision: movimiento.notaRemision,
    });
  }

  const stock: StockPreparado[] = [];
  const conMinimo = new Set<string>();
  for (const fila of datos.stock) {
    const lugar = `stock ${fila.obraId} ${fila.material}`;
    exigirObra(fila.obraId, lugar);
    const material = materialActivo(fila.material, lugar);
    if (!material) continue;
    const clave = `${fila.obraId}:${material.id}`;
    if (conMinimo.has(clave)) problemas.push(`${lugar}: fila repetida`);
    conMinimo.add(clave);
    if (fila.minimo < 0) problemas.push(`${lugar}: el mínimo debe ser ≥ 0`);
    const cantidad = cantidades.get(clave) ?? 0;
    if (cantidad !== fila.cantidadEsperada) {
      problemas.push(
        `${lugar}: la cantidad calculada es ${cantidad} y el documento dice ${fila.cantidadEsperada}`,
      );
    }
    const estado = calcularEstado(cantidad, fila.minimo);
    if (estado !== fila.estadoEsperado) {
      problemas.push(
        `${lugar}: el estado calculado es ${estado} y el documento dice ${fila.estadoEsperado}`,
      );
    }
    stock.push({
      obraId: fila.obraId,
      materialId: material.id,
      cantidad,
      minimo: fila.minimo,
      actualizadoEn: ultimos.get(clave) ?? inicioD,
    });
  }
  for (const clave of cantidades.keys()) {
    if (!conMinimo.has(clave)) {
      problemas.push(
        `stock ${clave}: tiene movimientos pero no está en la tabla de stock del documento`,
      );
    }
  }

  if (problemas.length > 0) throw new SemillaInvalidaError(problemas);

  return {
    d,
    materiales: datos.materiales,
    obraAcceso: datos.obraAcceso.map((obra) => ({
      ...obra,
      actualizadoEn: inicioD,
    })),
    movimientos,
    stock,
    cierres,
  };
}
