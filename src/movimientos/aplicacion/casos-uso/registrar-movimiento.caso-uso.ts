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
import {
  CIERRE_PERIODO_REPOSITORIO,
  type CierrePeriodoRepositorio,
} from '../../../cierres/aplicacion/puertos/cierre-periodo.repositorio.js';
import { periodoDe } from '../../../compartido/dominio/periodo.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import { Outbox } from '../../../compartido/infraestructura/mensajeria/outbox.js';
import { Transaccion } from '../../../compartido/infraestructura/mongo/transaccion.js';
import {
  STOCK_REPOSITORIO,
  StockCambiadoError,
  type StockRepositorio,
} from '../../../stock/aplicacion/puertos/stock.repositorio.js';
import { cruzaAlBajo, StockObra } from '../../../stock/dominio/stock-obra.js';
import {
  ajusteDeStock,
  datosMovimientoRegistrado,
  type Movimiento,
  periodoCerrado,
  superaElStock,
  type TipoMovimiento,
} from '../../dominio/movimiento.js';
import {
  MOVIMIENTO_REPOSITORIO,
  MovimientoRepetidoError,
  type MovimientoRepositorio,
} from '../puertos/movimiento.repositorio.js';

/** Lo que llega en `POST /movimientos` (ya validado). */
export interface RegistrarMovimientoEntrada {
  /** UUID generado en el celular. */
  id: string;
  obraId: string;
  materialId: string;
  tipo: TipoMovimiento;
  cantidad: number;
  /** Obligatoria en salidas; `null` en ingresos. */
  partidaId: string | null;
  /** Solo en ingresos, opcional. */
  numeroNotaRemision: string | null;
  registradoEn: Date;
}

/** El movimiento, cómo quedó el stock del material y si se creó ahora (`201`) o ya existía (`200`). */
export interface ResultadoRegistro {
  movimiento: Movimiento;
  stock: StockObra;
  creado: boolean;
}

/** Veces que se vuelve a intentar si el stock cambió a la vez por otro movimiento. */
export const INTENTOS_STOCK = 5;

/**
 * `POST /movimientos` (004, diseño): todo en una transacción de MongoDB.
 * 1. Si ya existe un movimiento con ese `id`, lo devuelve sin volver a sumar ni restar.
 * 2. Acceso (solo el almacenero asignado: `403 SIN_PERMISO` / `404 OBRA_NO_ENCONTRADA`) y
 *    material activo (`404 MATERIAL_NO_ENCONTRADO` / `422 MATERIAL_INACTIVO`).
 * 3. Periodo = mes de `registradoEn` en `America/La_Paz`; si está cerrado, `409 PERIODO_CERRADO`.
 * 4. Ajusta `stock_obra` con control de versión (si choca con otro movimiento, se repite todo) e
 *    inserta el movimiento.
 * 5. `superaStock` si la salida es mayor que el stock que había.
 * 6. Si el stock quedó `BAJO` y antes no lo estaba (o no había fila), outbox `StockBajo`.
 * 7. Siempre, outbox `MovimientoRegistrado` (reportes de la capa 4) con el precio referencial
 *    del material en ese momento (401).
 * Los eventos van en la misma transacción que el movimiento: si algo falla, no queda nada.
 */
@Injectable()
export class RegistrarMovimientoCasoUso {
  constructor(
    private readonly acceso: AccesoObraServicio,
    @Inject(MOVIMIENTO_REPOSITORIO)
    private readonly movimientos: MovimientoRepositorio,
    @Inject(STOCK_REPOSITORIO) private readonly stock: StockRepositorio,
    @Inject(MATERIAL_REPOSITORIO)
    private readonly materiales: MaterialRepositorio,
    @Inject(CIERRE_PERIODO_REPOSITORIO)
    private readonly cierres: CierrePeriodoRepositorio,
    private readonly transaccion: Transaccion,
    private readonly outbox: Outbox,
  ) {}

  /** `correlacionId`: el `X-Request-Id` de la petición (va en los eventos si es un UUID). */
  async ejecutar(
    entrada: RegistrarMovimientoEntrada,
    usuario: UsuarioAutenticado,
    correlacionId?: string,
  ): Promise<ResultadoRegistro> {
    for (let intento = 1; ; intento++) {
      try {
        return await this.transaccion.ejecutar(() =>
          this.registrar(entrada, usuario, correlacionId),
        );
      } catch (error) {
        // Otro envío del mismo registro llegó a la vez y ganó: es un repetido.
        if (error instanceof MovimientoRepetidoError) {
          const existente = await this.movimientos.buscar(entrada.id);
          if (existente) return this.repetido(existente, usuario);
        }
        if (error instanceof StockCambiadoError && intento < INTENTOS_STOCK) {
          continue;
        }
        throw error;
      }
    }
  }

  private async registrar(
    entrada: RegistrarMovimientoEntrada,
    usuario: UsuarioAutenticado,
    correlacionId: string | undefined,
  ): Promise<ResultadoRegistro> {
    const existente = await this.movimientos.buscar(entrada.id);
    if (existente) return this.repetido(existente, usuario);

    const { obraId, materialId, tipo, cantidad } = entrada;
    await this.acceso.exigirRegistrarMovimientos(obraId, usuario);
    const material = await this.materiales.buscar(materialId);
    if (!material) throw materialNoEncontrado();
    if (!material.activo) throw materialInactivo();

    const periodo = periodoDe(entrada.registradoEn);
    if (await this.cierres.estaCerrado(obraId, periodo)) {
      throw periodoCerrado(periodo);
    }

    const cambio = await this.stock.ajustar(
      obraId,
      materialId,
      ajusteDeStock(tipo, cantidad),
      new Date(),
    );
    const movimiento: Movimiento = {
      id: entrada.id,
      obraId,
      materialId,
      tipo,
      cantidad,
      partidaId: tipo === 'SALIDA' ? entrada.partidaId : null,
      ordenCompraId: null,
      periodo,
      cerrado: false,
      superaStock: superaElStock(
        tipo,
        cantidad,
        cambio.anterior?.cantidad ?? 0,
      ),
      registradoPor: usuario.id,
      registradoEn: entrada.registradoEn,
      notaRemision:
        tipo === 'INGRESO' && entrada.numeroNotaRemision
          ? { numero: entrada.numeroNotaRemision, claveFoto: null }
          : null,
    };
    await this.movimientos.crear(movimiento);

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
    await this.outbox.agregar(
      'MovimientoRegistrado',
      datosMovimientoRegistrado(movimiento, material.precioReferencial),
      correlacionId,
    );
    return { movimiento, stock: cambio.actual, creado: true };
  }

  /**
   * Envío repetido (convenciones, «Idempotencia»): devuelve el movimiento como quedó y el stock
   * actual, sin volver a sumar ni a publicar. Solo a quien puede registrar en esa obra, para no
   * revelar movimientos de otras obras.
   */
  private async repetido(
    existente: Movimiento,
    usuario: UsuarioAutenticado,
  ): Promise<ResultadoRegistro> {
    await this.acceso.exigirRegistrarMovimientos(existente.obraId, usuario);
    const stock =
      (await this.stock.buscar(existente.obraId, existente.materialId)) ??
      new StockObra(
        existente.obraId,
        existente.materialId,
        0,
        0,
        0,
        new Date(),
      );
    return { movimiento: existente, stock, creado: false };
  }
}
