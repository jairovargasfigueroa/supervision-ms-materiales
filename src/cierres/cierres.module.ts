import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MensajeriaModule } from '../compartido/infraestructura/mensajeria/mensajeria.module.js';
import {
  MovimientoDocumento,
  MovimientoSchema,
} from '../movimientos/infraestructura/movimiento.schema.js';
import { CerrarConsumosCasoUso } from './aplicacion/casos-uso/cerrar-consumos.caso-uso.js';
import { ReabrirConsumosCasoUso } from './aplicacion/casos-uso/reabrir-consumos.caso-uso.js';
import { CIERRE_PERIODO_REPOSITORIO } from './aplicacion/puertos/cierre-periodo.repositorio.js';
import { MOVIMIENTOS_PERIODO_REPOSITORIO } from './aplicacion/puertos/movimientos-periodo.repositorio.js';
import { CerrarConsumosConsumidor } from './infraestructura/cerrar-consumos.consumidor.js';
import { CierrePeriodoRepositorioMongo } from './infraestructura/cierre-periodo.repositorio.mongo.js';
import {
  CierrePeriodoDocumento,
  CierrePeriodoSchema,
} from './infraestructura/cierre-periodo.schema.js';
import { MovimientosPeriodoRepositorioMongo } from './infraestructura/movimientos-periodo.repositorio.mongo.js';
import { ReabrirConsumosConsumidor } from './infraestructura/reabrir-consumos.consumidor.js';

/**
 * Cierres de periodo por obra (`cierre_periodo`). Los escribe la saga (008: `CerrarConsumos` y
 * `ReabrirConsumos`, que además marcan `cerrado` en los movimientos del periodo); los movimientos
 * (004) los leen con `CIERRE_PERIODO_REPOSITORIO` para rechazar los de un periodo cerrado.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CierrePeriodoDocumento.name, schema: CierrePeriodoSchema },
      { name: MovimientoDocumento.name, schema: MovimientoSchema },
    ]),
    MensajeriaModule,
  ],
  providers: [
    {
      provide: CIERRE_PERIODO_REPOSITORIO,
      useClass: CierrePeriodoRepositorioMongo,
    },
    {
      provide: MOVIMIENTOS_PERIODO_REPOSITORIO,
      useClass: MovimientosPeriodoRepositorioMongo,
    },
    CerrarConsumosCasoUso,
    ReabrirConsumosCasoUso,
    CerrarConsumosConsumidor,
    ReabrirConsumosConsumidor,
  ],
  exports: [CIERRE_PERIODO_REPOSITORIO],
})
export class CierresModule {}
