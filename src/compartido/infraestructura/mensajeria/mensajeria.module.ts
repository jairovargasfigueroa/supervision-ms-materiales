import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Transaccion } from '../mongo/transaccion.js';
import { ConsumidorMensajes } from './consumidor.js';
import { Inbox } from './inbox.js';
import { MensajeProcesado, MensajeProcesadoSchema } from './inbox.schema.js';
import { RabbitCliente } from './rabbit.cliente.js';

/**
 * RabbitMQ (cola `materiales`), inbox `mensaje_procesado` y transacciones de MongoDB. Cada módulo
 * que escucha un tipo de mensaje importa este módulo y registra su manejador en
 * `ConsumidorMensajes` (`onModuleInit`). En las pruebas se reemplaza `RabbitCliente`.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MensajeProcesado.name, schema: MensajeProcesadoSchema },
    ]),
  ],
  providers: [Transaccion, Inbox, ConsumidorMensajes, RabbitCliente],
  exports: [Transaccion, ConsumidorMensajes],
})
export class MensajeriaModule {}
