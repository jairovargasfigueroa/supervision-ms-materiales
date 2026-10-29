import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, errors } from 'jose';
import {
  CONFIG_PRUEBA,
  crearClavesPrueba,
  type ClavesPrueba,
} from '../../../../test/utilidades/tokens-prueba.js';
import { TokenInvalidoError, ValidadorToken } from './validador-token.js';

describe('ValidadorToken', () => {
  let claves: ClavesPrueba;
  let validador: ValidadorToken;

  beforeAll(async () => {
    claves = await crearClavesPrueba();
    validador = new ValidadorToken(
      claves.jwks,
      new ConfigService(CONFIG_PRUEBA),
    );
  });

  it('devuelve el usuario de un token válido', async () => {
    const token = await claves.firmar();
    await expect(validador.validar(`Bearer ${token}`)).resolves.toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      roles: ['residente'],
      azp: 'erp',
    });
  });

  it('acepta el esquema Bearer sin importar mayúsculas', async () => {
    const token = await claves.firmar();
    await expect(validador.validar(`bearer ${token}`)).resolves.toMatchObject({
      azp: 'erp',
    });
  });

  it('deja los roles vacíos si el token no trae realm_access', async () => {
    const token = await claves.firmar({ payload: { realm_access: undefined } });
    await expect(validador.validar(`Bearer ${token}`)).resolves.toMatchObject({
      roles: [],
    });
  });

  it.each([
    ['sin encabezado', undefined],
    ['encabezado vacío', ''],
    ['otro esquema', 'Basic dXN1YXJpbzpjbGF2ZQ=='],
    ['token mal formado', 'Bearer no-es-un-jwt'],
  ])('rechaza %s', async (_caso, encabezado) => {
    await expect(validador.validar(encabezado)).rejects.toBeInstanceOf(
      TokenInvalidoError,
    );
  });

  it('rechaza un token firmado con otra clave', async () => {
    const token = await claves.firmarConOtraClave();
    await expect(validador.validar(`Bearer ${token}`)).rejects.toThrow(
      'El token no es válido.',
    );
  });

  it('rechaza un emisor distinto', async () => {
    const token = await claves.firmar({
      emisor: 'http://otro/realms/supervision',
    });
    await expect(validador.validar(`Bearer ${token}`)).rejects.toBeInstanceOf(
      TokenInvalidoError,
    );
  });

  it('rechaza una audiencia distinta', async () => {
    const token = await claves.firmar({ audiencia: 'account' });
    await expect(validador.validar(`Bearer ${token}`)).rejects.toBeInstanceOf(
      TokenInvalidoError,
    );
  });

  it('rechaza un token vencido', async () => {
    const token = await claves.firmar({ venceEn: -120 });
    await expect(validador.validar(`Bearer ${token}`)).rejects.toThrow(
      'El token venció.',
    );
  });

  it('rechaza un token sin sub', async () => {
    const token = await claves.firmar({ payload: { sub: '' } });
    await expect(validador.validar(`Bearer ${token}`)).rejects.toBeInstanceOf(
      TokenInvalidoError,
    );
  });
  it('responde 503 si Keycloak no responde al pedir el JWKS', async () => {
    const sinKeycloak = new ValidadorToken(
      createRemoteJWKSet(new URL('http://127.0.0.1:1/certs')),
      new ConfigService(CONFIG_PRUEBA),
    );
    const token = await claves.firmar();
    await expect(sinKeycloak.validar(`Bearer ${token}`)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('responde 503 si el JWKS tarda demasiado', async () => {
    const lento = new ValidadorToken(() => {
      throw new errors.JWKSTimeout();
    }, new ConfigService(CONFIG_PRUEBA));
    const token = await claves.firmar();
    await expect(lento.validar(`Bearer ${token}`)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
