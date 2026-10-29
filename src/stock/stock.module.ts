import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccesoObraModule } from '../acceso-obra/acceso-obra.module.js';
import { CatalogoModule } from '../catalogo/catalogo.module.js';
import { MensajeriaModule } from '../compartido/infraestructura/mensajeria/mensajeria.module.js';
import { FijarMinimoCasoUso } from './aplicacion/casos-uso/fijar-minimo.caso-uso.js';
import { ListarStockObraCasoUso } from './aplicacion/casos-uso/listar-stock-obra.caso-uso.js';
import { ResumirStockCasoUso } from './aplicacion/casos-uso/resumir-stock.caso-uso.js';
import { STOCK_REPOSITORIO } from './aplicacion/puertos/stock.repositorio.js';
import { StockRepositorioMongo } from './infraestructura/stock.repositorio.mongo.js';
import {
  StockObraDocumento,
  StockObraSchema,
} from './infraestructura/stock-obra.schema.js';
import { StockController } from './presentacion/stock.controller.js';
import { StockResumenController } from './presentacion/stock-resumen.controller.js';

/**
 * Stock por obra (`stock_obra`, 003): consulta con su estado y mínimo por material, y resumen de
 * materiales bajos por obra para el tablero (009). Exporta `STOCK_REPOSITORIO` para los
 * movimientos (004).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockObraDocumento.name, schema: StockObraSchema },
    ]),
    AccesoObraModule,
    CatalogoModule,
    MensajeriaModule,
  ],
  controllers: [StockController, StockResumenController],
  providers: [
    { provide: STOCK_REPOSITORIO, useClass: StockRepositorioMongo },
    ListarStockObraCasoUso,
    FijarMinimoCasoUso,
    ResumirStockCasoUso,
  ],
  exports: [STOCK_REPOSITORIO],
})
export class StockModule {}
