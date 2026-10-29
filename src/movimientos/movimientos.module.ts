import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccesoObraModule } from '../acceso-obra/acceso-obra.module.js';
import { CatalogoModule } from '../catalogo/catalogo.module.js';
import { CierresModule } from '../cierres/cierres.module.js';
import { MensajeriaModule } from '../compartido/infraestructura/mensajeria/mensajeria.module.js';
import { StockModule } from '../stock/stock.module.js';
import { RegistrarMovimientoCasoUso } from './aplicacion/casos-uso/registrar-movimiento.caso-uso.js';
import { MOVIMIENTO_REPOSITORIO } from './aplicacion/puertos/movimiento.repositorio.js';
import { MovimientoRepositorioMongo } from './infraestructura/movimiento.repositorio.mongo.js';
import {
  MovimientoDocumento,
  MovimientoSchema,
} from './infraestructura/movimiento.schema.js';
import { MovimientosController } from './presentacion/movimientos.controller.js';

/**
 * Ingresos y salidas de material por obra (`movimiento`, 004): ajusta `stock_obra` y respeta los
 * periodos cerrados (`cierre_periodo`).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MovimientoDocumento.name, schema: MovimientoSchema },
    ]),
    AccesoObraModule,
    CatalogoModule,
    StockModule,
    CierresModule,
    MensajeriaModule,
  ],
  controllers: [MovimientosController],
  providers: [
    { provide: MOVIMIENTO_REPOSITORIO, useClass: MovimientoRepositorioMongo },
    RegistrarMovimientoCasoUso,
  ],
})
export class MovimientosModule {}
