import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { AnyBulkWriteOperation, Connection, Model } from 'mongoose';
import { CierrePeriodoDocumento } from '../cierres/infraestructura/cierre-periodo.schema.js';
import { idCierrePeriodo } from '../cierres/infraestructura/cierre-periodo.schema.js';
import { MaterialDocumento } from '../catalogo/infraestructura/material.schema.js';
import { ObraAccesoDocumento } from '../acceso-obra/infraestructura/obra-acceso.schema.js';
import { aDecimal } from '../compartido/infraestructura/mongo/decimal.js';
import {
  sesionActual,
  Transaccion,
} from '../compartido/infraestructura/mongo/transaccion.js';
import { MovimientoDocumento } from '../movimientos/infraestructura/movimiento.schema.js';
import {
  idStockObra,
  StockObraDocumento,
} from '../stock/infraestructura/stock-obra.schema.js';
import { leerDatosSemilla, type DatosSemilla } from './datos-semilla.js';
import json from './materiales.json' with { type: 'json' };
import { prepararSemilla, type SemillaPreparada } from './preparar-semilla.js';

/** Colecciones que carga la semilla, en el orden del resumen. */
export const COLECCIONES_SEMILLA = [
  'material',
  'obra_acceso',
  'stock_obra',
  'movimiento',
  'cierre_periodo',
] as const;
export type ColeccionSemilla = (typeof COLECCIONES_SEMILLA)[number];

export interface ResumenSemilla {
  /** Fecha de carga D (`AAAA-MM-DD`). */
  fecha: string;
  /** Documentos que esta carga insertó (los que ya existían por `_id` no se tocan). */
  insertados: Record<ColeccionSemilla, number>;
  /** Documentos en cada colección después de la carga. */
  totales: Record<ColeccionSemilla | 'outbox_evento', number>;
}

/**
 * Carga los datos de prueba de Materiales (011): en una sola transacción, *upsert* por `_id` con
 * `$setOnInsert` (lo que ya existe no se pisa; cargar dos veces no duplica). No escribe en
 * `outbox_evento` ni en `mensaje_procesado`: la semilla no publica eventos.
 */
@Injectable()
export class CargarSemilla {
  constructor(
    @InjectConnection() private readonly conexion: Connection,
    private readonly transaccion: Transaccion,
    @InjectModel(MaterialDocumento.name)
    private readonly materiales: Model<MaterialDocumento>,
    @InjectModel(ObraAccesoDocumento.name)
    private readonly obrasAcceso: Model<ObraAccesoDocumento>,
    @InjectModel(StockObraDocumento.name)
    private readonly stock: Model<StockObraDocumento>,
    @InjectModel(MovimientoDocumento.name)
    private readonly movimientos: Model<MovimientoDocumento>,
    @InjectModel(CierrePeriodoDocumento.name)
    private readonly cierres: Model<CierrePeriodoDocumento>,
  ) {}

  async ejecutar(
    d: string,
    datos: DatosSemilla = leerDatosSemilla(json),
  ): Promise<ResumenSemilla> {
    // Calcula y verifica todo antes de escribir: si algo no cuadra, no se toca la base.
    const semilla = prepararSemilla(datos, d);

    // Colecciones e índices listos antes de la transacción.
    await Promise.all(this.modelos().map(([, modelo]) => modelo.init()));

    const insertados = await this.transaccion.ejecutar(async () => {
      const resultado = {} as Record<ColeccionSemilla, number>;
      for (const [coleccion, modelo, operaciones] of this.operaciones(
        semilla,
      )) {
        const escritura = await modelo.bulkWrite(operaciones, {
          session: sesionActual() ?? undefined,
        });
        resultado[coleccion] = escritura.upsertedCount;
      }
      return resultado;
    });

    const totales = {} as ResumenSemilla['totales'];
    for (const [coleccion, modelo] of this.modelos()) {
      totales[coleccion] = await modelo.countDocuments();
    }
    totales.outbox_evento = await this.conexion
      .collection('outbox_evento')
      .countDocuments();
    return { fecha: d, insertados, totales };
  }

  private modelos(): [ColeccionSemilla, ModeloSemilla][] {
    return [
      ['material', this.materiales],
      ['obra_acceso', this.obrasAcceso],
      ['stock_obra', this.stock],
      ['movimiento', this.movimientos],
      ['cierre_periodo', this.cierres],
    ];
  }

  private operaciones(
    semilla: SemillaPreparada,
  ): [ColeccionSemilla, ModeloSemilla, AnyBulkWriteOperation[]][] {
    const modelo = new Map(this.modelos());
    const fila = (coleccion: ColeccionSemilla, documentos: Documento[]) =>
      [
        coleccion,
        modelo.get(coleccion),
        documentos.map(insertarSiNoExiste),
      ] as [ColeccionSemilla, ModeloSemilla, AnyBulkWriteOperation[]];

    return [
      fila(
        'material',
        semilla.materiales.map((m) => ({
          _id: m.id,
          codigo: m.codigo,
          nombre: m.nombre,
          tipo: m.tipo,
          unidad: m.unidad,
          unidad_plural: m.unidadPlural,
          precio_referencial: aDecimal(m.precioReferencial),
          proveedor_habitual_id: m.proveedorHabitualId,
          activo: m.activo,
          atributos: m.atributos.map(({ nombre, valor }) => ({
            nombre,
            valor,
          })),
        })),
      ),
      fila(
        'obra_acceso',
        semilla.obraAcceso.map((o) => ({
          _id: o.obraId,
          nombre: o.nombre,
          residente_id: o.residenteId,
          maestro_id: o.maestroId,
          almacenero_id: o.almaceneroId,
          cliente_id: o.clienteId,
          actualizado_en: o.actualizadoEn,
        })),
      ),
      fila(
        'stock_obra',
        semilla.stock.map((s) => ({
          _id: idStockObra(s.obraId, s.materialId),
          obra_id: s.obraId,
          material_id: s.materialId,
          cantidad: aDecimal(s.cantidad),
          minimo: aDecimal(s.minimo),
          version: 1,
          actualizado_en: s.actualizadoEn,
        })),
      ),
      fila(
        'movimiento',
        semilla.movimientos.map((m) => ({
          _id: m.id,
          obra_id: m.obraId,
          material_id: m.materialId,
          tipo: m.tipo,
          cantidad: aDecimal(m.cantidad),
          partida_id: m.partidaId,
          orden_compra_id: null,
          periodo: m.periodo,
          cerrado: m.cerrado,
          supera_stock: m.superaStock,
          registrado_por: m.registradoPor,
          registrado_en: m.registradoEn,
          nota_remision: m.notaRemision
            ? { numero: m.notaRemision, clave_foto: null }
            : null,
        })),
      ),
      fila(
        'cierre_periodo',
        semilla.cierres.map((c) => ({
          _id: idCierrePeriodo(c.obraId, c.periodo),
          planilla_id: c.planillaId,
          estado: c.estado,
          cerrado_en: c.cerradoEn,
        })),
      ),
    ];
  }
}

// Los modelos tienen tipos distintos; aquí solo se usan init, bulkWrite y countDocuments.
type ModeloSemilla = Model<any>;

type Documento = { _id: string } & Record<string, unknown>;

/** *Upsert* por `_id` que solo escribe si el documento no existe (`$setOnInsert`). */
function insertarSiNoExiste({ _id, ...campos }: Documento) {
  return {
    updateOne: {
      filter: { _id },
      update: { $setOnInsert: campos },
      upsert: true,
    },
  };
}
