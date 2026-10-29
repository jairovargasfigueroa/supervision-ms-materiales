import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  aDecimal,
  aNumero,
} from '../../compartido/infraestructura/mongo/decimal.js';
import { sesionActual } from '../../compartido/infraestructura/mongo/transaccion.js';
import {
  MovimientoRepetidoError,
  type MovimientoRepositorio,
} from '../aplicacion/puertos/movimiento.repositorio.js';
import type { Movimiento, TipoMovimiento } from '../dominio/movimiento.js';
import { MovimientoDocumento } from './movimiento.schema.js';

@Injectable()
export class MovimientoRepositorioMongo implements MovimientoRepositorio {
  constructor(
    @InjectModel(MovimientoDocumento.name)
    private readonly modelo: Model<MovimientoDocumento>,
  ) {}

  async buscar(id: string): Promise<Movimiento | null> {
    const documento = await this.modelo
      .findById(id)
      .session(sesionActual())
      .lean();
    return documento ? aDominio(documento) : null;
  }

  async crear(movimiento: Movimiento): Promise<void> {
    try {
      await this.modelo.create([aDocumento(movimiento)], {
        session: sesionActual(),
      });
    } catch (error) {
      if (esClaveDuplicada(error)) {
        throw new MovimientoRepetidoError(movimiento.id);
      }
      throw error;
    }
  }
}

function aDocumento(movimiento: Movimiento): MovimientoDocumento {
  return {
    _id: movimiento.id,
    obra_id: movimiento.obraId,
    material_id: movimiento.materialId,
    tipo: movimiento.tipo,
    cantidad: aDecimal(movimiento.cantidad),
    partida_id: movimiento.partidaId,
    orden_compra_id: movimiento.ordenCompraId,
    periodo: movimiento.periodo,
    cerrado: movimiento.cerrado,
    supera_stock: movimiento.superaStock,
    registrado_por: movimiento.registradoPor,
    registrado_en: movimiento.registradoEn,
    nota_remision: movimiento.notaRemision
      ? {
          numero: movimiento.notaRemision.numero,
          clave_foto: movimiento.notaRemision.claveFoto,
        }
      : null,
  };
}

export function aDominio(documento: MovimientoDocumento): Movimiento {
  return {
    id: documento._id,
    obraId: documento.obra_id,
    materialId: documento.material_id,
    tipo: documento.tipo as TipoMovimiento,
    cantidad: aNumero(documento.cantidad),
    partidaId: documento.partida_id ?? null,
    ordenCompraId: documento.orden_compra_id ?? null,
    periodo: documento.periodo,
    cerrado: documento.cerrado,
    superaStock: documento.supera_stock,
    registradoPor: documento.registrado_por,
    registradoEn: documento.registrado_en,
    notaRemision: documento.nota_remision
      ? {
          numero: documento.nota_remision.numero,
          claveFoto: documento.nota_remision.clave_foto ?? null,
        }
      : null,
  };
}

/** Clave duplicada en `_id` (código 11000 de MongoDB). */
function esClaveDuplicada(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}
