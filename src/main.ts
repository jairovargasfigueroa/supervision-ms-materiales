import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Registros en JSON en producción y en texto legible en desarrollo (convenciones).
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });
  await app.listen(process.env.PORT ?? 8082);
}
await bootstrap();
