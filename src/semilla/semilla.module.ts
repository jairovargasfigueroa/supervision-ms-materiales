import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ObraAccesoDocumento,
  ObraAccesoSchema,
} from '../acceso-obra/infraestructura/obra-acceso.schema.js';
import {
  MaterialDocumento,
  MaterialSchema,
} from '../catalogo/infraestructura/material.schema.js';
import {
  CierrePeriodoDocumento,
  CierrePeriodoSchema,
} from '../cierres/infraestructura/cierre-periodo.schema.js';
import {
  MensajeProcesado,
  MensajeProcesadoSchema,
} from '../compartido/infraestructura/mensajeria/inbox.schema.js';
import {
  OutboxEvento,
  OutboxEventoSchema,
} from '../compartido/infraestructura/mensajeria/outbox.schema.js';
import { Transaccion } from '../compartido/infraestructura/mongo/transaccion.js';
import {
  MovimientoDocumento,
  MovimientoSchema,
} from '../movimientos/infraestructura/movimiento.schema.js';
import {
  StockObraDocumento,
  StockObraSchema,
} from '../stock/infraestructura/stock-obra.schema.js';
import { CargarSemilla } from './cargar-semilla.js';
import { verificarGuarda } from './guarda.js';
import { VaciarSemilla } from './vaciar.js';

/**
 * Contexto de la semilla (011): solo la configuración y los esquemas de Mongoose, sin HTTP, sin
 * RabbitMQ y sin el publicador del outbox. La guarda corre antes de conectarse: con
 * `NODE_ENV=production` o una base que no es local, el módulo no arranca.
 *
 * `config` reemplaza al `.env` (pruebas); sin él, se lee el `.env` y las variables de entorno.
 */
@Module({})
export class SemillaModule {
  static registrar(config?: Record<string, string>): DynamicModule {
    return {
      module: SemillaModule,
      imports: [
        ConfigModule.forRoot(
          config
            ? { isGlobal: true, ignoreEnvFile: true, load: [() => config] }
            : { isGlobal: true },
        ),
        MongooseModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configuracion: ConfigService) => {
            const uri = configuracion.get<string>('MONGODB_URI');
            verificarGuarda({
              nodeEnv: configuracion.get<string>('NODE_ENV'),
              mongoUri: uri,
            });
            // Sin reintentos largos: si MongoDB no responde, la semilla falla enseguida.
            return {
              uri,
              retryAttempts: 1,
              serverSelectionTimeoutMS: 5_000,
            };
          },
        }),
        MongooseModule.forFeature([
          { name: MaterialDocumento.name, schema: MaterialSchema },
          { name: ObraAccesoDocumento.name, schema: ObraAccesoSchema },
          { name: StockObraDocumento.name, schema: StockObraSchema },
          { name: MovimientoDocumento.name, schema: MovimientoSchema },
          { name: CierrePeriodoDocumento.name, schema: CierrePeriodoSchema },
          { name: OutboxEvento.name, schema: OutboxEventoSchema },
          { name: MensajeProcesado.name, schema: MensajeProcesadoSchema },
        ]),
      ],
      providers: [Transaccion, CargarSemilla, VaciarSemilla],
    };
  }
}
