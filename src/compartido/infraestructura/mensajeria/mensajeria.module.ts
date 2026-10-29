import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Transaccion } from '../mongo/transaccion.js';
import { ConsumidorMensajes } from './consumidor.js';
import { Inbox } from './inbox.js';
import { MensajeProcesado, MensajeProcesadoSchema } from './inbox.schema.js';
import { Outbox } from './outbox.js';
import { OutboxPublicador } from './outbox.publicador.js';
import { OutboxEvento, OutboxEventoSchema } from './outbox.schema.js';
import { RabbitCliente } from './rabbit.cliente.js';

/**
 * RabbitMQ (cola `materiales`), inbox `mensaje_procesado`, outbox `outbox_evento` (y su
 * publicador) y transacciones de MongoDB. Cada módulo que escucha un tipo de mensaje importa este
 * módulo y registra su manejador en `ConsumidorMensajes` (`onModuleInit`); el que publica un
 * evento lo agrega con `Outbox.agregar` dentro de su transacción. En las pruebas se reemplaza
 * `RabbitCliente`.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MensajeProcesado.name, schema: MensajeProcesadoSchema },
      { name: OutboxEvento.name, schema: OutboxEventoSchema },
    ]),
  ],
  providers: [
    Transaccion,
    Inbox,
    ConsumidorMensajes,
    RabbitCliente,
    Outbox,
    OutboxPublicador,
  ],
  exports: [Transaccion, ConsumidorMensajes, Outbox],
})
export class MensajeriaModule {}
