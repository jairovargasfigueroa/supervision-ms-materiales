import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CierrePeriodoDocumento,
  CierrePeriodoSchema,
} from './infraestructura/cierre-periodo.schema.js';

/**
 * Cierres de periodo por obra (`cierre_periodo`). Los escribe la saga (008); los movimientos (004)
 * los leen para rechazar los de un periodo cerrado.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CierrePeriodoDocumento.name, schema: CierrePeriodoSchema },
    ]),
  ],
})
export class CierresModule {}
