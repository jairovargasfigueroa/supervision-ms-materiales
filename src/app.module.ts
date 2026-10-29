import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AccesoObraModule } from './acceso-obra/acceso-obra.module.js';
import { CompartidoModule } from './compartido/compartido.module.js';
import { MensajeriaModule } from './compartido/infraestructura/mensajeria/mensajeria.module.js';
import { SaludModule } from './salud/salud.module.js';

@Module({
  imports: [
    // Lee las variables del archivo .env (no se sube al repositorio)
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    CompartidoModule,
    MensajeriaModule,
    SaludModule,
    AccesoObraModule,
  ],
})
export class AppModule {}
