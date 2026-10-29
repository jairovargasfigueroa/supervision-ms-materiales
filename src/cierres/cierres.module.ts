import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CIERRE_PERIODO_REPOSITORIO } from './aplicacion/puertos/cierre-periodo.repositorio.js';
import { CierrePeriodoRepositorioMongo } from './infraestructura/cierre-periodo.repositorio.mongo.js';
import {
  CierrePeriodoDocumento,
  CierrePeriodoSchema,
} from './infraestructura/cierre-periodo.schema.js';

/**
 * Cierres de periodo por obra (`cierre_periodo`). Los escribe la saga (008); los movimientos (004)
 * los leen con `CIERRE_PERIODO_REPOSITORIO` para rechazar los de un periodo cerrado.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CierrePeriodoDocumento.name, schema: CierrePeriodoSchema },
    ]),
  ],
  providers: [
    {
      provide: CIERRE_PERIODO_REPOSITORIO,
      useClass: CierrePeriodoRepositorioMongo,
    },
  ],
  exports: [CIERRE_PERIODO_REPOSITORIO],
})
export class CierresModule {}
