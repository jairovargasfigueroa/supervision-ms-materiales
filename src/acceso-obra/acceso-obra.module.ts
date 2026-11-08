import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MensajeriaModule } from '../compartido/infraestructura/mensajeria/mensajeria.module.js';
import { AccesoObraServicio } from './aplicacion/acceso-obra.servicio.js';
import { RegistrarObraAccesoCasoUso } from './aplicacion/casos-uso/registrar-obra-acceso.caso-uso.js';
import { OBRA_ACCESO_REPOSITORIO } from './aplicacion/puertos/obra-acceso.repositorio.js';
import { ObraAccesoRepositorioMongo } from './infraestructura/obra-acceso.repositorio.mongo.js';
import {
  ObraAccesoDocumento,
  ObraAccesoSchema,
} from './infraestructura/obra-acceso.schema.js';
import { ObraRegistradaConsumidor } from './infraestructura/obra-registrada.consumidor.js';

/**
 * Copia de las asignaciones de cada obra (`obra_acceso`), que llega con `ObraRegistrada`.
 * Exporta `AccesoObraServicio` para los módulos que deciden quién ve o registra en una obra.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ObraAccesoDocumento.name, schema: ObraAccesoSchema },
    ]),
    MensajeriaModule,
  ],
  providers: [
    { provide: OBRA_ACCESO_REPOSITORIO, useClass: ObraAccesoRepositorioMongo },
    RegistrarObraAccesoCasoUso,
    ObraRegistradaConsumidor,
    AccesoObraServicio,
  ],
  exports: [AccesoObraServicio],
})
export class AccesoObraModule {}
