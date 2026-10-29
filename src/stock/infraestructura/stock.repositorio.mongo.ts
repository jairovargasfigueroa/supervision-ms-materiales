import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { sumarCantidades } from '../../compartido/dominio/cantidad.js';
import {
  aDecimal,
  aNumero,
} from '../../compartido/infraestructura/mongo/decimal.js';
import { sesionActual } from '../../compartido/infraestructura/mongo/transaccion.js';
import {
  type CambioStock,
  StockCambiadoError,
  type StockRepositorio,
} from '../aplicacion/puertos/stock.repositorio.js';
import { StockObra } from '../dominio/stock-obra.js';
import { idStockObra, StockObraDocumento } from './stock-obra.schema.js';

@Injectable()
export class StockRepositorioMongo implements StockRepositorio {
  constructor(
    @InjectModel(StockObraDocumento.name)
    private readonly modelo: Model<StockObraDocumento>,
  ) {}

  async listarPorObra(obraId: string): Promise<StockObra[]> {
    const documentos = await this.modelo
      .find({ obra_id: obraId })
      .session(sesionActual())
      .lean();
    return documentos.map(aDominio);
  }

  async buscar(obraId: string, materialId: string): Promise<StockObra | null> {
    const documento = await this.modelo
      .findById(idStockObra(obraId, materialId))
      .session(sesionActual())
      .lean();
    return documento ? aDominio(documento) : null;
  }

  async ajustar(
    obraId: string,
    materialId: string,
    ajuste: number,
    ahora: Date,
  ): Promise<CambioStock> {
    const _id = idStockObra(obraId, materialId);
    const anterior = await this.buscar(obraId, materialId);
    const actual = new StockObra(
      obraId,
      materialId,
      sumarCantidades(anterior?.cantidad ?? 0, ajuste),
      anterior?.minimo ?? 0,
      (anterior?.version ?? 0) + 1,
      ahora,
    );
    if (!anterior) {
      // Primer movimiento del material en la obra: la fila nace con mínimo 0.
      try {
        await this.modelo.create(
          [
            {
              _id,
              obra_id: obraId,
              material_id: materialId,
              cantidad: aDecimal(actual.cantidad),
              minimo: aDecimal(0),
              version: actual.version,
              actualizado_en: ahora,
            },
          ],
          { session: sesionActual() },
        );
      } catch (error) {
        if (esClaveDuplicada(error)) {
          throw new StockCambiadoError(obraId, materialId);
        }
        throw error;
      }
      return { anterior, actual };
    }
    // Control de versión: solo si nadie la cambió desde que se leyó.
    const resultado = await this.modelo
      .updateOne(
        { _id, version: anterior.version },
        {
          $set: {
            cantidad: aDecimal(actual.cantidad),
            version: actual.version,
            actualizado_en: ahora,
          },
        },
      )
      .session(sesionActual());
    if (resultado.matchedCount === 0) {
      throw new StockCambiadoError(obraId, materialId);
    }
    return { anterior, actual };
  }

  async fijarMinimo(
    obraId: string,
    materialId: string,
    minimo: number,
    ahora: Date,
  ): Promise<CambioStock> {
    // Una sola operación atómica: devuelve la fila como estaba (o null si no existía).
    const previo = await this.modelo
      .findOneAndUpdate(
        { _id: idStockObra(obraId, materialId) },
        {
          $set: { minimo: aDecimal(minimo), actualizado_en: ahora },
          $setOnInsert: {
            obra_id: obraId,
            material_id: materialId,
            cantidad: aDecimal(0),
          },
          $inc: { version: 1 },
        },
        { upsert: true, returnDocument: 'before' },
      )
      .session(sesionActual())
      .lean();
    const anterior = previo ? aDominio(previo) : null;
    return {
      anterior,
      actual: new StockObra(
        obraId,
        materialId,
        anterior?.cantidad ?? 0,
        minimo,
        (anterior?.version ?? 0) + 1,
        ahora,
      ),
    };
  }
}

function aDominio(documento: StockObraDocumento): StockObra {
  return new StockObra(
    documento.obra_id,
    documento.material_id,
    aNumero(documento.cantidad),
    aNumero(documento.minimo),
    documento.version,
    documento.actualizado_en,
  );
}

/** Clave duplicada en `_id` (código 11000 de MongoDB). */
function esClaveDuplicada(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}
