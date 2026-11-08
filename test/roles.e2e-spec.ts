import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CompartidoModule } from '../src/compartido/compartido.module.js';
import { Roles } from '../src/compartido/infraestructura/auth/roles.decorator.js';
import { UsuarioActual } from '../src/compartido/infraestructura/auth/usuario-actual.decorator.js';
import type { UsuarioAutenticado } from '../src/compartido/infraestructura/auth/usuario-autenticado.js';
import { CONJUNTO_CLAVES } from '../src/compartido/infraestructura/auth/validador-token.js';
import { SaludModule } from '../src/salud/salud.module.js';
import {
  AZP,
  CONFIG_PRUEBA,
  crearClavesPrueba,
  type ClavesPrueba,
} from './utilidades/tokens-prueba.js';

// Rutas que solo existen en esta prueba: todavía no hay endpoints del negocio (001).
@Controller('prueba-roles')
class PruebaRolesController {
  @Get('admin-gerente')
  @Roles('admin', 'gerente')
  adminGerente(@UsuarioActual() usuario: UsuarioAutenticado) {
    return { id: usuario.id };
  }

  @Get('cliente')
  @Roles('cliente')
  cliente() {
    return { ok: true };
  }

  @Get('sin-roles')
  sinRoles() {
    return { ok: true };
  }
}

@Controller('prueba-roles-clase')
@Roles('almacenero')
class PruebaRolesClaseController {
  @Get()
  listar() {
    return { ok: true };
  }
}

describe('Roles (e2e)', () => {
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
      controllers: [PruebaRolesController, PruebaRolesClaseController],
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

  const pedir = (ruta: string, token?: string) => {
    const peticion = request(app.getHttpServer()).get(ruta);
    if (token) peticion.set('Authorization', `Bearer ${token}`);
    return peticion;
  };

  const esperar403 = async (ruta: string, token: string) => {
    const respuesta = await pedir(ruta, token).expect(403);
    expect(respuesta.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(respuesta.body).toMatchObject({
      type: 'about:blank',
      title: 'Sin permiso',
      status: 403,
      codigo: 'SIN_PERMISO',
    });
    expect(typeof respuesta.body.detail).toBe('string');
  };

  it('sin token responde 401 NO_AUTENTICADO (antes que el rol)', async () => {
    const respuesta = await pedir('/prueba-roles/admin-gerente').expect(401);
    expect(respuesta.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(respuesta.body).toMatchObject({
      status: 401,
      codigo: 'NO_AUTENTICADO',
    });
  });

  it('con un token inválido responde 401', async () => {
    await pedir(
      '/prueba-roles/admin-gerente',
      await claves.firmarConOtraClave(),
    ).expect(401);
  });

  it('residente (erp) en una ruta admin,gerente responde 403 SIN_PERMISO', async () => {
    await esperar403(
      '/prueba-roles/admin-gerente',
      await claves.firmarConRoles(['residente'], AZP.erp),
    );
  });

  it.each(['admin', 'gerente'])(
    '%s (erp) en una ruta admin,gerente responde 200',
    async (rol) => {
      await pedir(
        '/prueba-roles/admin-gerente',
        await claves.firmarConRoles([rol], AZP.erp),
      ).expect(200, { id: '11111111-1111-1111-1111-111111111111' });
    },
  );

  it('admin que inició sesión en el portal no cuenta como admin (403)', async () => {
    await esperar403(
      '/prueba-roles/admin-gerente',
      await claves.firmarConRoles(['admin', 'cliente'], AZP.portal),
    );
  });

  it('demo1 (residente y cliente) con azp portal entra a una ruta de cliente', async () => {
    await pedir(
      '/prueba-roles/cliente',
      await claves.firmarConRoles(['residente', 'cliente'], AZP.portal),
    ).expect(200);
  });

  it('demo1 (residente y cliente) con azp erp no entra a una ruta de cliente', async () => {
    await esperar403(
      '/prueba-roles/cliente',
      await claves.firmarConRoles(['residente', 'cliente'], AZP.erp),
    );
  });

  it('cliente con azp erp no cuenta como cliente (403)', async () => {
    await esperar403(
      '/prueba-roles/cliente',
      await claves.firmarConRoles(['cliente'], AZP.erp),
    );
  });

  it('un cliente de servicio usa los roles del token tal cual', async () => {
    await pedir(
      '/prueba-roles/cliente',
      await claves.firmarConRoles(['cliente'], AZP.gateway),
    ).expect(200);
  });

  it('@Roles en el controlador vale para todas sus rutas', async () => {
    await pedir(
      '/prueba-roles-clase',
      await claves.firmarConRoles(['almacenero'], AZP.appObra),
    ).expect(200);
    await esperar403(
      '/prueba-roles-clase',
      await claves.firmarConRoles(['maestro'], AZP.appObra),
    );
  });

  it('una ruta sin @Roles exige solo token válido', async () => {
    await pedir('/prueba-roles/sin-roles').expect(401);
    await pedir(
      '/prueba-roles/sin-roles',
      await claves.firmarConRoles(['cliente'], AZP.portal),
    ).expect(200);
  });

  it('GET /salud sigue sin pasar por el token ni el rol', async () => {
    await pedir('/salud').expect(200, { estado: 'ok' });
  });
});
