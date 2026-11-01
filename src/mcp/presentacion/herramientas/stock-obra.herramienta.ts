import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ConsultarStockObrasCasoUso } from '../../../stock/aplicacion/casos-uso/consultar-stock-obras.caso-uso.js';
import { estadoStock, uuid } from '../esquemas.js';
import type { ContextoMcp, HerramientaMcp } from '../herramienta.js';

const entrada = z.strictObject({
  obraId: uuid().optional().describe('Id de la obra; sin él, todas las obras.'),
  estados: z
    .array(estadoStock)
    .min(1)
    .max(3)
    .optional()
    .describe('Estados del stock que se devuelven; por defecto los tres.'),
  limite: z
    .int()
    .min(1)
    .max(100)
    .default(100)
    .describe('Filas máximas (1 a 100).'),
});

const salida = z.strictObject({
  filas: z.array(
    z.strictObject({
      obraId: z.string(),
      obraNombre: z.string(),
      materialId: z.string(),
      codigo: z.string(),
      nombre: z.string(),
      unidad: z.string(),
      cantidad: z.number(),
      minimo: z.number(),
      estado: estadoStock,
    }),
  ),
  total: z.int(),
  truncado: z.boolean(),
});

type Salida = z.output<typeof salida>;

/** `stock_obra` (501): stock por obra con su mínimo y estado, primero los más críticos. */
@Injectable()
export class StockObraHerramienta implements HerramientaMcp<
  typeof entrada,
  typeof salida
> {
  readonly nombre = 'stock_obra';
  readonly descripcion =
    'Devuelve el stock de materiales por obra, al día, con su mínimo y su estado (BAJO, JUSTO, OK), primero los más críticos.';
  readonly entrada = entrada;
  readonly salida = salida;

  constructor(private readonly consultar: ConsultarStockObrasCasoUso) {}

  async ejecutar(
    argumentos: z.output<typeof entrada>,
    { usuario }: ContextoMcp,
  ): Promise<Salida> {
    const resultado = await this.consultar.ejecutar(
      {
        obraId: argumentos.obraId,
        estados: argumentos.estados ?? estadoStock.options,
        limite: argumentos.limite,
      },
      usuario,
    );
    return {
      filas: resultado.filas.map(({ stock, material, obraNombre }) => ({
        obraId: stock.obraId,
        obraNombre,
        materialId: material.id,
        codigo: material.codigo,
        nombre: material.nombre,
        unidad: material.unidad,
        cantidad: stock.cantidad,
        minimo: stock.minimo,
        estado: stock.estado,
      })),
      total: resultado.total,
      truncado: resultado.truncado,
    };
  }

  filas(resultado: Salida): number {
    return resultado.filas.length;
  }
}
