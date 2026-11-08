import { Inject, Injectable } from '@nestjs/common';
import { Outbox } from '../../../compartido/infraestructura/mensajeria/outbox.js';
import { Transaccion } from '../../../compartido/infraestructura/mongo/transaccion.js';
import {
  type DecisionReapertura,
  decidirReapertura,
} from '../../dominio/cierre-periodo.js';
import {
  CIERRE_PERIODO_REPOSITORIO,
  type CierrePeriodoRepositorio,
} from '../puertos/cierre-periodo.repositorio.js';
import {
  MOVIMIENTOS_PERIODO_REPOSITORIO,
  type MovimientosPeriodoRepositorio,
} from '../puertos/movimientos-periodo.repositorio.js';
import type { ConsumosPeriodoEntrada } from './cerrar-consumos.caso-uso.js';

export const TIPO_CONSUMOS_REABIERTOS = 'ConsumosReabiertos';

/**
 * Compensación del paso 3 de la saga (008, diseño «Materiales»), idempotente y en una
 * transacción de MongoDB:
 * - `CERRADO` por esta planilla → `REABIERTO`, `cerrado = false` en los movimientos del periodo
 *   y `ConsumosReabiertos`;
 * - sin cierre o ya `REABIERTO` por esta planilla → `ConsumosReabiertos` otra vez, sin cambios;
 * - el cierre es de otra planilla → no se toca nada ni se publica (quien llama lo registra).
 */
@Injectable()
export class ReabrirConsumosCasoUso {
  constructor(
    @Inject(CIERRE_PERIODO_REPOSITORIO)
    private readonly cierres: CierrePeriodoRepositorio,
    @Inject(MOVIMIENTOS_PERIODO_REPOSITORIO)
    private readonly movimientos: MovimientosPeriodoRepositorio,
    private readonly transaccion: Transaccion,
    private readonly outbox: Outbox,
  ) {}

  ejecutar(
    entrada: ConsumosPeriodoEntrada,
    correlacionId?: string,
  ): Promise<DecisionReapertura> {
    const { planillaId, obraId, periodo } = entrada;
    return this.transaccion.ejecutar(async () => {
      const actual = await this.cierres.buscar(obraId, periodo);
      const decision = decidirReapertura(actual, planillaId);
      if (decision === 'DE_OTRA_PLANILLA') return decision;
      if (decision === 'REABRIR' && actual) {
        await this.cierres.guardar({ ...actual, estado: 'REABIERTO' });
        await this.movimientos.marcarCerrados(obraId, periodo, false);
      }
      await this.outbox.agregar(
        TIPO_CONSUMOS_REABIERTOS,
        { planillaId, obraId, periodo },
        correlacionId,
      );
      return decision;
    });
  }
}
