import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { sesionActual } from '../../compartido/infraestructura/mongo/transaccion.js';
import type { CierrePeriodoRepositorio } from '../aplicacion/puertos/cierre-periodo.repositorio.js';
import {
  CierrePeriodoDocumento,
  idCierrePeriodo,
} from './cierre-periodo.schema.js';

@Injectable()
export class CierrePeriodoRepositorioMongo implements CierrePeriodoRepositorio {
  constructor(
    @InjectModel(CierrePeriodoDocumento.name)
    private readonly modelo: Model<CierrePeriodoDocumento>,
  ) {}

  async estaCerrado(obraId: string, periodo: string): Promise<boolean> {
    const cierre = await this.modelo
      .exists({ _id: idCierrePeriodo(obraId, periodo), estado: 'CERRADO' })
      .session(sesionActual());
    return cierre !== null;
  }
}
