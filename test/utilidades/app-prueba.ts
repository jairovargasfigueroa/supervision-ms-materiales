import type { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { CompartidoModule } from '../../src/compartido/compartido.module.js';
import { CONJUNTO_CLAVES } from '../../src/compartido/infraestructura/auth/validador-token.js';
import { RabbitCliente } from '../../src/compartido/infraestructura/mensajeria/rabbit.cliente.js';
import {
  CONFIG_PRUEBA,
  crearClavesPrueba,
  type ClavesPrueba,
} from './tokens-prueba.js';

export interface AppPrueba {
  app: INestApplication;
  modulo: TestingModule;
  claves: ClavesPrueba;
  conexion: Connection;
  /** Borra todos los documentos de todas las colecciones (entre pruebas). */
  vaciar(): Promise<void>;
  cerrar(): Promise<void>;
}

/**
 * App HTTP de prueba con MongoDB en memoria (*replica set*, para las transacciones), tokens
 * firmados con una clave de prueba y un doble de `RabbitCliente` (`rabbit`, por defecto uno que
 * no está conectado). Se arma con los módulos del negocio que se prueban.
 */
export async function crearAppPrueba(
  modulos: (Type | DynamicModule)[],
  rabbit: unknown = { conectado: false },
): Promise<AppPrueba> {
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const claves = await crearClavesPrueba();
  const modulo = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => CONFIG_PRUEBA],
      }),
      MongooseModule.forRoot(mongo.getUri('materiales_db')),
      CompartidoModule,
      ...modulos,
    ],
  })
    .overrideProvider(CONJUNTO_CLAVES)
    .useValue(claves.jwks)
    .overrideProvider(RabbitCliente)
    .useValue(rabbit)
    .compile();
  const app = modulo.createNestApplication({ logger: false });
  await app.init();
  const conexion = modulo.get<Connection>(getConnectionToken());
  // Índices (código único) y colecciones listos antes de la primera prueba y transacción.
  for (const modelo of Object.values(conexion.models)) {
    await modelo.createCollection();
    await modelo.syncIndexes();
  }
  return {
    app,
    modulo,
    claves,
    conexion,
    vaciar: async () => {
      for (const modelo of Object.values(conexion.models)) {
        await modelo.deleteMany({});
      }
    },
    cerrar: async () => {
      await app.close();
      await mongo.stop();
    },
  };
}
