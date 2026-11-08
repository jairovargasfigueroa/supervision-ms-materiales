import { Inject, Injectable } from '@nestjs/common';
import { Outbox } from '../../../compartido/infraestructura/mensajeria/outbox.js';
import { Transaccion } from '../../../compartido/infraestructura/mongo/transaccion.js';
import {
  type DecisionCierre,
  decidirCierre,
  motivoCerradoPorOtra,
} from '../../dominio/cierre-periodo.js';
import {
  CIERRE_PERIODO_REPOSITORIO,
  type CierrePeriodoRepositorio,
} from '../puertos/cierre-periodo.repositorio.js';
import {
  MOVIMIENTOS_PERIODO_REPOSITORIO,
  type MovimientosPeriodoRepositorio,
} from '../puertos/movimientos-periodo.repositorio.js';

/** `datos` de `CerrarConsumos` y `ReabrirConsumos` (contrato de eventos, 008). */
export interface ConsumosPeriodoEntrada {
  planillaId: string;
  obraId: string;
  /** `AAAA-MM`. */
  periodo: string;
}

export const TIPO_CONSUMOS_CERRADOS = 'ConsumosCerrados';
export const TIPO_CIERRE_FALLIDO = 'CierreFallido';

/**
 * Paso 3 de la saga «aprobar planilla» (008, diseño «Materiales»), en una transacción de MongoDB
 * (`cierre_periodo` + `movimiento` + outbox):
 * - sin cierre o `REABIERTO` → `cierre_periodo` `CERRADO` con esta planilla, `cerrado = true` en
 *   los movimientos de la obra en el periodo y `ConsumosCerrados`;
 * - ya `CERRADO` por la misma planilla → `ConsumosCerrados` otra vez, sin cambios;
 * - `CERRADO` por otra planilla → `CierreFallido` con el periodo real, sin cambios.
 * Las respuestas llevan el `correlacionId` del comando (el id de la saga en Obras).
 */
@Injectable()
export class CerrarConsumosCasoUso {
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
  ): Promise<DecisionCierre> {
    const { planillaId, obraId, periodo } = entrada;
    return this.transaccion.ejecutar(async () => {
      const decision = decidirCierre(
        await this.cierres.buscar(obraId, periodo),
        planillaId,
      );
      if (decision === 'CERRADO_POR_OTRA') {
        await this.outbox.agregar(
          TIPO_CIERRE_FALLIDO,
          { planillaId, motivo: motivoCerradoPorOtra(periodo) },
          correlacionId,
        );
        return decision;
      }
      if (decision === 'CERRAR') {
        await this.cierres.guardar({
          obraId,
          periodo,
          planillaId,
          estado: 'CERRADO',
          cerradoEn: new Date(),
        });
        await this.movimientos.marcarCerrados(obraId, periodo, true);
      }
      await this.outbox.agregar(
        TIPO_CONSUMOS_CERRADOS,
        { planillaId, obraId, periodo },
        correlacionId,
      );
      return decision;
    });
  }
}
