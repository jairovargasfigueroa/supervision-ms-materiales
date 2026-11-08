import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  ConsumidorMensajes,
  type ManejadorMensaje,
} from '../../compartido/infraestructura/mensajeria/consumidor.js';
import type { Sobre } from '../../compartido/infraestructura/mensajeria/sobre.js';
import { CerrarConsumosCasoUso } from '../aplicacion/casos-uso/cerrar-consumos.caso-uso.js';
import { leerDatosConsumos } from './datos-consumos.js';

export const TIPO_CERRAR_CONSUMOS = 'CerrarConsumos';

/**
 * Escucha `comando.materiales.CerrarConsumos` (paso 3 de la saga «aprobar planilla»). Idempotente
 * por el inbox (`id` del mensaje) y por `cierre_periodo` (uno por obra y periodo).
 */
@Injectable()
export class CerrarConsumosConsumidor
  implements ManejadorMensaje, OnModuleInit
{
  private readonly registro = new Logger('Cierres');

  constructor(
    private readonly consumidor: ConsumidorMensajes,
    private readonly cerrarConsumos: CerrarConsumosCasoUso,
  ) {}

  onModuleInit(): void {
    this.consumidor.registrar(TIPO_CERRAR_CONSUMOS, this);
  }

  async manejar(sobre: Sobre): Promise<void> {
    const entrada = leerDatosConsumos(TIPO_CERRAR_CONSUMOS, sobre.datos);
    const decision = await this.cerrarConsumos.ejecutar(
      entrada,
      sobre.correlacionId,
    );
    if (decision === 'CERRADO_POR_OTRA') {
      this.registro.warn(
        `CerrarConsumos de la planilla ${entrada.planillaId}: el periodo ${entrada.periodo} de la obra ${entrada.obraId} ya lo cerró otra planilla (CierreFallido).`,
      );
    }
  }
}
