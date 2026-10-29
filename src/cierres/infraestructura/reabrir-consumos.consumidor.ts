import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  ConsumidorMensajes,
  type ManejadorMensaje,
} from '../../compartido/infraestructura/mensajeria/consumidor.js';
import type { Sobre } from '../../compartido/infraestructura/mensajeria/sobre.js';
import { ReabrirConsumosCasoUso } from '../aplicacion/casos-uso/reabrir-consumos.caso-uso.js';
import { leerDatosConsumos } from './datos-consumos.js';

export const TIPO_REABRIR_CONSUMOS = 'ReabrirConsumos';

/**
 * Escucha `comando.materiales.ReabrirConsumos` (compensación del paso 3 de la saga). Idempotente
 * por el inbox y por el estado de `cierre_periodo`.
 */
@Injectable()
export class ReabrirConsumosConsumidor
  implements ManejadorMensaje, OnModuleInit
{
  private readonly registro = new Logger('Cierres');

  constructor(
    private readonly consumidor: ConsumidorMensajes,
    private readonly reabrirConsumos: ReabrirConsumosCasoUso,
  ) {}

  onModuleInit(): void {
    this.consumidor.registrar(TIPO_REABRIR_CONSUMOS, this);
  }

  async manejar(sobre: Sobre): Promise<void> {
    const entrada = leerDatosConsumos(TIPO_REABRIR_CONSUMOS, sobre.datos);
    const decision = await this.reabrirConsumos.ejecutar(
      entrada,
      sobre.correlacionId,
    );
    if (decision === 'DE_OTRA_PLANILLA') {
      this.registro.warn(
        `ReabrirConsumos de la planilla ${entrada.planillaId}: el cierre del periodo ${entrada.periodo} de la obra ${entrada.obraId} es de otra planilla; no se reabre.`,
      );
    }
  }
}
