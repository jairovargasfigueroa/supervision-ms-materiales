import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Registros en JSON en producción y en texto legible en desarrollo (convenciones).
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });
  // Cuerpo JSON de hasta 1 MB (convenciones, «Seguridad»); más grande responde 413
  app.useBodyParser('json', { limit: '1mb' });
  app.disable('x-powered-by');
  await app.listen(process.env.PORT ?? 8082);
}
await bootstrap();
