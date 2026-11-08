import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { sesionActual } from '../../compartido/infraestructura/mongo/transaccion.js';
import type { CierrePeriodoRepositorio } from '../aplicacion/puertos/cierre-periodo.repositorio.js';
import type { CierrePeriodo, EstadoCierre } from '../dominio/cierre-periodo.js';
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

  async buscar(obraId: string, periodo: string): Promise<CierrePeriodo | null> {
    const documento = await this.modelo
      .findById(idCierrePeriodo(obraId, periodo))
      .session(sesionActual())
      .lean();
    if (!documento) return null;
    return {
      obraId,
      periodo,
      planillaId: documento.planilla_id,
      estado: documento.estado as EstadoCierre,
      cerradoEn: documento.cerrado_en,
    };
  }

  async guardar(cierre: CierrePeriodo): Promise<void> {
    await this.modelo
      .replaceOne(
        { _id: idCierrePeriodo(cierre.obraId, cierre.periodo) },
        {
          planilla_id: cierre.planillaId,
          estado: cierre.estado,
          cerrado_en: cierre.cerradoEn,
        },
        { upsert: true },
      )
      .session(sesionActual());
  }
}
