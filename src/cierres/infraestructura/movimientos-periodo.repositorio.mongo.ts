import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { sesionActual } from '../../compartido/infraestructura/mongo/transaccion.js';
import { MovimientoDocumento } from '../../movimientos/infraestructura/movimiento.schema.js';
import type { MovimientosPeriodoRepositorio } from '../aplicacion/puertos/movimientos-periodo.repositorio.js';

/**
 * Marca `cerrado` en los movimientos de una obra y periodo (índice `por_obra_periodo`). Usa el
 * mismo modelo de `movimiento` que el módulo de movimientos (Nest reutiliza el ya registrado).
 */
@Injectable()
export class MovimientosPeriodoRepositorioMongo implements MovimientosPeriodoRepositorio {
  constructor(
    @InjectModel(MovimientoDocumento.name)
    private readonly modelo: Model<MovimientoDocumento>,
  ) {}

  async marcarCerrados(
    obraId: string,
    periodo: string,
    cerrado: boolean,
  ): Promise<number> {
    const resultado = await this.modelo
      .updateMany(
        { obra_id: obraId, periodo, cerrado: !cerrado },
        { $set: { cerrado } },
      )
      .session(sesionActual());
    return resultado.modifiedCount;
  }
}
