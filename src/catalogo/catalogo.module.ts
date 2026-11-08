import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActualizarMaterialCasoUso } from './aplicacion/casos-uso/actualizar-material.caso-uso.js';
import { CrearMaterialCasoUso } from './aplicacion/casos-uso/crear-material.caso-uso.js';
import { ListarMaterialesCasoUso } from './aplicacion/casos-uso/listar-materiales.caso-uso.js';
import { MATERIAL_REPOSITORIO } from './aplicacion/puertos/material.repositorio.js';
import { MaterialRepositorioMongo } from './infraestructura/material.repositorio.mongo.js';
import {
  MaterialDocumento,
  MaterialSchema,
} from './infraestructura/material.schema.js';
import { MaterialesController } from './presentacion/materiales.controller.js';

/**
 * Catálogo de materiales (`material`, 003). Exporta `MATERIAL_REPOSITORIO` para los módulos que
 * necesitan leer materiales (stock, movimientos).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MaterialDocumento.name, schema: MaterialSchema },
    ]),
  ],
  controllers: [MaterialesController],
  providers: [
    { provide: MATERIAL_REPOSITORIO, useClass: MaterialRepositorioMongo },
    CrearMaterialCasoUso,
    ActualizarMaterialCasoUso,
    ListarMaterialesCasoUso,
  ],
  exports: [MATERIAL_REPOSITORIO],
})
export class CatalogoModule {}
