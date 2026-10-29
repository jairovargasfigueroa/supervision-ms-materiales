import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MovimientoDocumento,
  MovimientoSchema,
} from './infraestructura/movimiento.schema.js';

/** Ingresos y salidas de material por obra (`movimiento`, 004). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MovimientoDocumento.name, schema: MovimientoSchema },
    ]),
  ],
})
export class MovimientosModule {}
