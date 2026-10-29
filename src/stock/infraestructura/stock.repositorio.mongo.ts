import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  aDecimal,
  aNumero,
} from '../../compartido/infraestructura/mongo/decimal.js';
import { sesionActual } from '../../compartido/infraestructura/mongo/transaccion.js';
import type {
  CambioStock,
  StockRepositorio,
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
