import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { sesionActual } from '../../compartido/infraestructura/mongo/transaccion.js';
import type { ObraAccesoRepositorio } from '../aplicacion/puertos/obra-acceso.repositorio.js';
import { ObraAcceso } from '../dominio/obra-acceso.js';
import { ObraAccesoDocumento } from './obra-acceso.schema.js';

@Injectable()
export class ObraAccesoRepositorioMongo implements ObraAccesoRepositorio {
  constructor(
    @InjectModel(ObraAccesoDocumento.name)
    private readonly modelo: Model<ObraAccesoDocumento>,
  ) {}

  async guardar(obra: ObraAcceso): Promise<void> {
    const { residenteId, maestroId, almaceneroId, clienteId } =
      obra.asignaciones;
    await this.modelo
      .updateOne(
        { _id: obra.obraId },
        {
          $set: {
            nombre: obra.nombre,
            residente_id: residenteId,
            maestro_id: maestroId,
            almacenero_id: almaceneroId,
            cliente_id: clienteId,
            actualizado_en: obra.actualizadoEn,
          },
        },
        { upsert: true },
      )
      .session(sesionActual());
  }

  async buscar(obraId: string): Promise<ObraAcceso | null> {
    const documento = await this.modelo
      .findById(obraId)
      .session(sesionActual())
      .lean();
    return documento ? aDominio(documento) : null;
  }

  async buscarVarias(obraIds: readonly string[]): Promise<ObraAcceso[]> {
    if (obraIds.length === 0) return [];
    const documentos = await this.modelo
      .find({ _id: { $in: [...obraIds] } })
      .session(sesionActual())
      .lean();
    return documentos.map(aDominio);
  }
}

function aDominio(documento: ObraAccesoDocumento): ObraAcceso {
  return new ObraAcceso(
    documento._id,
    documento.nombre,
    {
      residenteId: documento.residente_id,
      maestroId: documento.maestro_id,
      almaceneroId: documento.almacenero_id,
      clienteId: documento.cliente_id,
    },
    documento.actualizado_en,
  );
}
