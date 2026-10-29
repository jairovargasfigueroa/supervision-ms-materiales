import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter, SortOrder, Types } from 'mongoose';
import { redondearCantidad } from '../../compartido/dominio/cantidad.js';
import type {
  CriteriosPagina,
  Pagina,
} from '../../compartido/dominio/paginacion.js';
import {
  aDecimal,
  aNumero,
} from '../../compartido/infraestructura/mongo/decimal.js';
import { sesionActual } from '../../compartido/infraestructura/mongo/transaccion.js';
import {
  type FiltroMovimientos,
  MovimientoRepetidoError,
  type MovimientoRepositorio,
  type OrdenMovimiento,
} from '../aplicacion/puertos/movimiento.repositorio.js';
import type { ConsumoPartida } from '../dominio/consumo.js';
import type { Movimiento, TipoMovimiento } from '../dominio/movimiento.js';
import { MovimientoDocumento } from './movimiento.schema.js';

/** Campo de `movimiento` por cada `orden` del JSON. */
const CAMPO_ORDEN: Record<OrdenMovimiento, string> = {
  registradoEn: 'registrado_en',
};

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

  async listar(
    obraId: string,
    filtro: FiltroMovimientos,
    criterios: CriteriosPagina<OrdenMovimiento>,
  ): Promise<Pagina<Movimiento>> {
    const consulta: QueryFilter<MovimientoDocumento> = { obra_id: obraId };
    if (filtro.periodo) consulta.periodo = filtro.periodo;
    const sentido: SortOrder = criterios.direccion === 'desc' ? -1 : 1;
    const [documentos, total] = await Promise.all([
      this.modelo
        .find(consulta)
        // `_id` desempata para que las páginas no repitan ni salten elementos.
        .sort({ [CAMPO_ORDEN[criterios.orden]]: sentido, _id: sentido })
        .skip((criterios.pagina - 1) * criterios.tamano)
        .limit(criterios.tamano)
        .session(sesionActual())
        .lean(),
      this.modelo.countDocuments(consulta).session(sesionActual()),
    ]);
    return {
      items: documentos.map(aDominio),
      total,
      pagina: criterios.pagina,
      tamano: criterios.tamano,
    };
  }

  async sumarSalidas(
    obraId: string,
    periodo: string,
  ): Promise<ConsumoPartida[]> {
    // Usa el índice `por_obra_periodo`; `$sum` de Decimal128 da una suma exacta.
    const grupos = await this.modelo
      .aggregate<{
        _id: { partida_id: string; material_id: string };
        cantidad: Types.Decimal128;
      }>([
        { $match: { obra_id: obraId, periodo, tipo: 'SALIDA' } },
        {
          $group: {
            _id: { partida_id: '$partida_id', material_id: '$material_id' },
            cantidad: { $sum: '$cantidad' },
          },
        },
        { $sort: { '_id.partida_id': 1, '_id.material_id': 1 } },
      ])
      .session(sesionActual());
    return grupos.map((grupo) => ({
      partidaId: grupo._id.partida_id,
      materialId: grupo._id.material_id,
      cantidad: redondearCantidad(aNumero(grupo.cantidad)),
    }));
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
