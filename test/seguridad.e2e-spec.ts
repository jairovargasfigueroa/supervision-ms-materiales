import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CompartidoModule } from '../src/compartido/compartido.module.js';
import { CONJUNTO_CLAVES } from '../src/compartido/infraestructura/auth/validador-token.js';
import { SaludModule } from '../src/salud/salud.module.js';
import {
  CONFIG_PRUEBA,
  crearClavesPrueba,
  type ClavesPrueba,
} from './utilidades/tokens-prueba.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// La app sin MongoDB ni Keycloak: GET /salud y la validación del token no usan la base,
// y el JWKS de Keycloak se cambia por uno local con una clave generada en la prueba.
describe('Salud y token (e2e)', () => {
  let app: INestApplication;
  let claves: ClavesPrueba;

  beforeAll(async () => {
    claves = await crearClavesPrueba();
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => CONFIG_PRUEBA],
        }),
        CompartidoModule,
        SaludModule,
      ],
    })
      .overrideProvider(CONJUNTO_CLAVES)
      .useValue(claves.jwks)
      .compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const esperar401 = async (autorizacion?: string) => {
    const peticion = request(app.getHttpServer()).get('/materiales');
    if (autorizacion) peticion.set('Authorization', autorizacion);
    const respuesta = await peticion.expect(401);
    expect(respuesta.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(respuesta.body).toMatchObject({
      type: 'about:blank',
      title: 'No autenticado',
      status: 401,
      codigo: 'NO_AUTENTICADO',
    });
    expect(typeof respuesta.body.detail).toBe('string');
    return respuesta;
  };

  it('GET /salud responde 200 sin token', async () => {
    await request(app.getHttpServer())
      .get('/salud')
      .expect(200, { estado: 'ok' });
  });

  it('GET /salud responde 200 aunque llegue un token inválido', async () => {
    await request(app.getHttpServer())
      .get('/salud')
      .set('Authorization', 'Bearer basura')
      .expect(200, { estado: 'ok' });
  });

  it('una ruta protegida sin token responde 401 NO_AUTENTICADO', async () => {
    await esperar401();
  });

  it('un token firmado con otra clave responde 401', async () => {
    await esperar401(`Bearer ${await claves.firmarConOtraClave()}`);
  });

  it('un emisor distinto responde 401', async () => {
    await esperar401(
      `Bearer ${await claves.firmar({ emisor: 'http://otro/realms/supervision' })}`,
    );
  });

  it('una audiencia distinta responde 401', async () => {
    await esperar401(`Bearer ${await claves.firmar({ audiencia: 'account' })}`);
  });

  it('un token vencido responde 401', async () => {
    const respuesta = await esperar401(
      `Bearer ${await claves.firmar({ venceEn: -120 })}`,
    );
    expect(respuesta.body.detail).toBe('El token venció.');
  });

  it('con token válido una ruta inexistente responde 404 (el token se aceptó)', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/no-existe')
      .set('Authorization', `Bearer ${await claves.firmar()}`)
      .expect(404);
    expect(respuesta.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(respuesta.body).toMatchObject({
      status: 404,
      codigo: 'RUTA_NO_ENCONTRADA',
    });
  });

  it('envía los encabezados de seguridad', async () => {
    const respuesta = await request(app.getHttpServer()).get('/salud');
    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
    expect(respuesta.headers['referrer-policy']).toBe('no-referrer');
  });

  it('devuelve el X-Request-Id recibido', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/salud')
      .set('X-Request-Id', 'prueba-123')
      .expect(200);
    expect(respuesta.headers['x-request-id']).toBe('prueba-123');
  });

  it('genera un X-Request-Id si no llega, también en los errores', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/materiales')
      .expect(401);
    expect(respuesta.headers['x-request-id']).toMatch(UUID);
  });

  it('cambia un X-Request-Id con caracteres no permitidos por uno generado', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/salud')
      .set('X-Request-Id', 'a b c')
      .expect(200);
    expect(respuesta.headers['x-request-id']).toMatch(UUID);
  });
});
