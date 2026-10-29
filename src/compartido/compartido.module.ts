import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { createRemoteJWKSet } from 'jose';
import { JwtGuard } from './infraestructura/auth/jwt.guard.js';
import { RolesGuard } from './infraestructura/auth/roles.guard.js';
import {
  CONJUNTO_CLAVES,
  ValidadorToken,
} from './infraestructura/auth/validador-token.js';
import { ProblemDetailsFilter } from './infraestructura/http/problem-details.filter.js';
import { RequestIdMiddleware } from './infraestructura/http/request-id.middleware.js';

/**
 * Piezas transversales del servicio: token de Keycloak y rol (guardias globales), errores en
 * Problem Details y `X-Request-Id`.
 */
@Module({
  providers: [
    {
      // El JWKS se pide a Keycloak recién cuando llega el primer token (la app arranca sin él).
      provide: CONJUNTO_CLAVES,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config
          .getOrThrow<string>('KEYCLOAK_URL')
          .replace(/\/+$/, '');
        const realm = config.getOrThrow<string>('KEYCLOAK_REALM');
        return createRemoteJWKSet(
          new URL(`${url}/realms/${realm}/protocol/openid-connect/certs`),
        );
      },
    },
    ValidadorToken,
    // Los guardias globales corren en este orden: primero el token, luego el rol.
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
  exports: [ValidadorToken],
})
export class CompartidoModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*ruta', method: RequestMethod.ALL });
  }
}
