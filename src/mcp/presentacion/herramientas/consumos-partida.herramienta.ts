import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ConsultarConsumosPartidaCasoUso } from '../../../movimientos/aplicacion/casos-uso/consultar-consumos-partida.caso-uso.js';
import { periodo, uuid } from '../esquemas.js';
import type { ContextoMcp, HerramientaMcp } from '../herramienta.js';

/** Filas máximas de una obra (501, diseño). */
export const FILAS_MAXIMAS_CONSUMOS = 200;
/** Filas máximas sin `obraId`, de todas las obras (505, diseño). */
export const FILAS_MAXIMAS_CONSUMOS_LOTE = 500;

const entrada = z.strictObject({
  obraId: uuid()
    .optional()
    .describe(
      'Id de la obra; sin él, todas las obras con consumo en el periodo.',
    ),
  periodo: periodo().describe('Mes AAAA-MM.'),
  partidaId: uuid().optional().describe('Id de la partida; sin él, todas.'),
});

const salida = z.strictObject({
  obraId: z.string().nullable(),
  periodo: z.string(),
  cerrado: z.boolean().nullable(),
  filas: z.array(
    z.strictObject({
      obraId: z.string(),
      obraNombre: z.string(),
      partidaId: z.string(),
      materialId: z.string(),
      codigo: z.string(),
      nombre: z.string(),
      unidad: z.string(),
      usado: z.number(),
      salidas: z.int(),
      salidasSuperanStock: z.int(),
    }),
  ),
  truncado: z.boolean(),
});

type Salida = z.output<typeof salida>;

/**
 * `consumos_partida` (501): material usado por partida y material en un periodo, de una obra o,
 * sin `obraId`, de todas las obras con consumo (lote, 505: `obraId` y `cerrado` en `null`).
 */
@Injectable()
export class ConsumosPartidaHerramienta implements HerramientaMcp<
  typeof entrada,
  typeof salida
> {
  readonly nombre = 'consumos_partida';
  readonly descripcion =
    'Devuelve el material usado (suma de salidas) por partida y material en un periodo, de una obra o de todas las obras con consumo, con las salidas que superaron el stock. Sirve para comparar con lo previsto de avance_obra.';
  readonly entrada = entrada;
  readonly salida = salida;

  constructor(private readonly consultar: ConsultarConsumosPartidaCasoUso) {}

  async ejecutar(
    argumentos: z.output<typeof entrada>,
    { usuario }: ContextoMcp,
  ): Promise<Salida> {
    const resultado = await this.consultar.ejecutar(
      {
        ...argumentos,
        limite: argumentos.obraId
          ? FILAS_MAXIMAS_CONSUMOS
          : FILAS_MAXIMAS_CONSUMOS_LOTE,
      },
      usuario,
    );
    return {
      obraId: argumentos.obraId ?? null,
      periodo: argumentos.periodo,
      cerrado: resultado.cerrado,
      filas: resultado.filas.map(({ resumen, material, obraNombre }) => ({
        obraId: resumen.obraId,
        obraNombre,
        partidaId: resumen.partidaId,
        materialId: resumen.materialId,
        codigo: material.codigo,
        nombre: material.nombre,
        unidad: material.unidad,
        usado: resumen.cantidad,
        salidas: resumen.salidas,
        salidasSuperanStock: resumen.salidasSuperanStock,
      })),
      truncado: resultado.truncado,
    };
  }

  filas(resultado: Salida): number {
    return resultado.filas.length;
  }
}
