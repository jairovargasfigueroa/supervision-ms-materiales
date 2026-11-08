import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter, SortOrder } from 'mongoose';
import type {
  CriteriosPagina,
  Pagina,
} from '../../compartido/dominio/paginacion.js';
import {
  aDecimal,
  aNumero,
} from '../../compartido/infraestructura/mongo/decimal.js';
import { sesionActual } from '../../compartido/infraestructura/mongo/transaccion.js';
import type {
  FiltroMateriales,
  MaterialRepositorio,
  OrdenMaterial,
} from '../aplicacion/puertos/material.repositorio.js';
import { codigoRepetido, Material } from '../dominio/material.js';
import type { TipoMaterial } from '../dominio/tipo-material.js';
import { MaterialDocumento } from './material.schema.js';

/** Campo de `material` por cada `orden` del JSON. */
const CAMPO_ORDEN: Record<OrdenMaterial, string> = {
  codigo: 'codigo',
  nombre: 'nombre',
  tipo: 'tipo',
  precioReferencial: 'precio_referencial',
};

@Injectable()
export class MaterialRepositorioMongo implements MaterialRepositorio {
  constructor(
    @InjectModel(MaterialDocumento.name)
    private readonly modelo: Model<MaterialDocumento>,
  ) {}

  async crear(material: Material): Promise<void> {
    try {
      await this.modelo.create([aDocumento(material)], {
        session: sesionActual(),
      });
    } catch (error) {
      throw traducirError(error, material.codigo);
    }
  }

  async guardar(material: Material): Promise<void> {
    const { _id, ...campos } = aDocumento(material);
    try {
      await this.modelo
        .updateOne({ _id }, { $set: campos })
        .session(sesionActual());
    } catch (error) {
      throw traducirError(error, material.codigo);
    }
  }

  async buscar(id: string): Promise<Material | null> {
    const documento = await this.modelo
      .findById(id)
      .session(sesionActual())
      .lean();
    return documento ? aDominio(documento) : null;
  }

  async buscarVarios(ids: readonly string[]): Promise<Material[]> {
    if (ids.length === 0) return [];
    const documentos = await this.modelo
      .find({ _id: { $in: [...ids] } })
      .session(sesionActual())
      .lean();
    return documentos.map(aDominio);
  }

  async listar(
    filtro: FiltroMateriales,
    criterios: CriteriosPagina<OrdenMaterial>,
  ): Promise<Pagina<Material>> {
    const consulta: QueryFilter<MaterialDocumento> = {};
    if (filtro.soloActivos) consulta.activo = true;
    if (filtro.busqueda) {
      const patron = new RegExp(escaparRegex(filtro.busqueda), 'i');
      consulta.$or = [{ codigo: patron }, { nombre: patron }];
    }
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
}

function aDocumento(material: Material): MaterialDocumento {
  return {
    _id: material.id,
    codigo: material.codigo,
    nombre: material.nombre,
    tipo: material.tipo,
    unidad: material.unidad,
    unidad_plural: material.unidadPlural,
    precio_referencial: aDecimal(material.precioReferencial),
    activo: material.activo,
    atributos: material.atributos.map(({ nombre, valor }) => ({
      nombre,
      valor,
    })),
  };
}

function aDominio(documento: MaterialDocumento): Material {
  return new Material(documento._id, {
    codigo: documento.codigo,
    nombre: documento.nombre,
    tipo: documento.tipo as TipoMaterial,
    unidad: documento.unidad,
    unidadPlural: documento.unidad_plural,
    precioReferencial: aNumero(documento.precio_referencial),
    activo: documento.activo,
    atributos: (documento.atributos ?? []).map(({ nombre, valor }) => ({
      nombre,
      valor,
    })),
  });
}

/** Clave duplicada en el índice único del código → `409 CODIGO_MATERIAL_REPETIDO`. */
function traducirError(error: unknown, codigo: string): unknown {
  if (typeof error !== 'object' || error === null) return error;
  const { code, keyPattern } = error as {
    code?: unknown;
    keyPattern?: Record<string, unknown>;
  };
  if (code === 11000 && keyPattern && 'codigo' in keyPattern) {
    return codigoRepetido(codigo);
  }
  return error;
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
