import request from 'supertest';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import { crearAppPrueba, type AppPrueba } from './utilidades/app-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const cemento = {
  codigo: 'CEM-IP30',
  nombre: 'Cemento IP-30',
  tipo: 'CEMENTO',
  unidad: 'bolsa',
  unidadPlural: 'bolsas',
  precioReferencial: 62,
  atributos: [{ nombre: 'peso', valor: '50 kg' }],
};

describe('Catálogo de materiales (e2e)', () => {
  let prueba: AppPrueba;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    prueba = await crearAppPrueba([CatalogoModule]);
    for (const rol of [
      'admin',
      'residente',
      'gerente',
      'maestro',
      'almacenero',
    ]) {
      tokens[rol] = await prueba.claves.firmarConRoles([rol]);
    }
    tokens.cliente = await prueba.claves.firmarConRoles(
      ['cliente'],
      AZP.portal,
    );
  }, 300_000);

  afterAll(async () => {
    await prueba?.cerrar();
  });

  beforeEach(async () => {
    await prueba.vaciar();
  });

  const servidor = () => prueba.app.getHttpServer();
  const crear = (cuerpo: object, token = tokens.admin) =>
    request(servidor())
      .post('/materiales')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpo);
  const actualizar = (id: string, cuerpo: object, token = tokens.admin) =>
    request(servidor())
      .put(`/materiales/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpo);
  const listar = (consulta = '', token = tokens.admin) =>
    request(servidor())
      .get(`/materiales${consulta}`)
      .set('Authorization', `Bearer ${token}`);

  describe('POST /materiales', () => {
    it('crea el material (201), activo por defecto y con el código normalizado', async () => {
      const respuesta = await crear({
        ...cemento,
        codigo: '  cem-ip30 ',
      }).expect(201);
      expect(respuesta.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        ...cemento,
        activo: true,
      });
      const guardado = await prueba.conexion
        .collection('material')
        .findOne({ codigo: 'CEM-IP30' });
      expect(guardado).toMatchObject({
        unidad_plural: 'bolsas',
        activo: true,
        atributos: [{ nombre: 'peso', valor: '50 kg' }],
      });
      expect(guardado?.precio_referencial.toString()).toBe('62');
    });

    it('código repetido (en otras mayúsculas) → 409 CODIGO_MATERIAL_REPETIDO', async () => {
      await crear(cemento).expect(201);
      const respuesta = await crear({ ...cemento, codigo: 'Cem-Ip30' }).expect(
        409,
      );
      expect(respuesta.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(respuesta.body).toMatchObject({
        status: 409,
        codigo: 'CODIGO_MATERIAL_REPETIDO',
        detail: 'Ya existe un material con el código CEM-IP30',
      });
    });

    it('datos inválidos → 400 DATOS_INVALIDOS con errores[] por campo', async () => {
      const respuesta = await crear({
        codigo: 'X'.repeat(21),
        nombre: '',
        tipo: 'VIDRIO',
        unidad: 'bolsa',
        precioReferencial: -1,
        atributos: [{ nombre: 'peso' }],
      }).expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      const campos = (respuesta.body.errores as { campo: string }[]).map(
        (e) => e.campo,
      );
      expect(new Set(campos)).toEqual(
        new Set([
          'codigo',
          'nombre',
          'tipo',
          'unidadPlural',
          'precioReferencial',
          'atributos.0.valor',
        ]),
      );
    });

    it('el código de 20 caracteres con espacios a los costados es válido', async () => {
      await crear({ ...cemento, codigo: `  ${'A'.repeat(20)}  ` }).expect(201);
    });

    it('precio con más de 2 decimales → 400', async () => {
      await crear({ ...cemento, precioReferencial: 1.005 }).expect(400);
    });

    it.each(['residente', 'gerente', 'maestro', 'almacenero'])(
      '%s no puede crear → 403 SIN_PERMISO',
      async (rol) => {
        const respuesta = await crear(cemento, tokens[rol]).expect(403);
        expect(respuesta.body.codigo).toBe('SIN_PERMISO');
      },
    );
  });

  describe('PUT /materiales/{id}', () => {
    it('desactiva el material sin borrarlo', async () => {
      const { body } = await crear(cemento).expect(201);
      const respuesta = await actualizar(body.id, {
        ...cemento,
        activo: false,
      }).expect(200);
      expect(respuesta.body).toMatchObject({ id: body.id, activo: false });
      const todos = await listar().expect(200);
      expect(todos.body.items).toEqual([
        expect.objectContaining({ id: body.id, activo: false }),
      ]);
      const activos = await listar('?soloActivos=true').expect(200);
      expect(activos.body).toMatchObject({ items: [], total: 0 });
    });

    it('si no existe → 404 MATERIAL_NO_ENCONTRADO', async () => {
      const respuesta = await actualizar('no-existe', {
        ...cemento,
        activo: true,
      }).expect(404);
      expect(respuesta.body.codigo).toBe('MATERIAL_NO_ENCONTRADO');
    });

    it('con el código de otro material → 409 CODIGO_MATERIAL_REPETIDO', async () => {
      await crear(cemento).expect(201);
      const { body } = await crear({ ...cemento, codigo: 'FE-12' }).expect(201);
      const respuesta = await actualizar(body.id, {
        ...cemento,
        codigo: 'cem-ip30',
        activo: true,
      }).expect(409);
      expect(respuesta.body.codigo).toBe('CODIGO_MATERIAL_REPETIDO');
    });

    it('exige activo (recibe el material completo) → 400', async () => {
      const { body } = await crear(cemento).expect(201);
      const respuesta = await actualizar(body.id, cemento).expect(400);
      expect(respuesta.body.errores).toEqual([
        expect.objectContaining({ campo: 'activo' }),
      ]);
    });

    it('el residente no puede editar → 403 SIN_PERMISO', async () => {
      const { body } = await crear(cemento).expect(201);
      await actualizar(
        body.id,
        { ...cemento, activo: false },
        tokens.residente,
      ).expect(403);
    });
  });

  describe('GET /materiales', () => {
    beforeEach(async () => {
      await crear(cemento).expect(201);
      await crear({
        ...cemento,
        codigo: 'FE-12',
        nombre: 'Fierro corrugado 12 mm',
        tipo: 'ACERO',
        unidad: 'barra',
        unidadPlural: 'barras',
        precioReferencial: 85.5,
        atributos: [],
      }).expect(201);
      await crear({
        ...cemento,
        codigo: 'ARE-FINA',
        nombre: 'Arena fina',
        tipo: 'AGREGADO',
        unidad: 'm³',
        unidadPlural: 'm³',
        precioReferencial: 150,
        activo: false,
        atributos: [],
      }).expect(201);
    });

    it('pagina por defecto: página 1, tamaño 20, orden codigo asc', async () => {
      const respuesta = await listar().expect(200);
      expect(respuesta.body).toMatchObject({ total: 3, pagina: 1, tamano: 20 });
      expect(
        respuesta.body.items.map((m: { codigo: string }) => m.codigo),
      ).toEqual(['ARE-FINA', 'CEM-IP30', 'FE-12']);
    });

    it('busca por código o nombre sin distinguir mayúsculas', async () => {
      const porNombre = await listar('?busqueda=fierro').expect(200);
      expect(porNombre.body.items).toEqual([
        expect.objectContaining({ codigo: 'FE-12', precioReferencial: 85.5 }),
      ]);
      const porCodigo = await listar('?busqueda=cem-').expect(200);
      expect(porCodigo.body.total).toBe(1);
      const conSimbolos = await listar('?busqueda=.*').expect(200);
      expect(conSimbolos.body.total).toBe(0);
    });

    it('soloActivos=true deja fuera los desactivados', async () => {
      const respuesta = await listar('?soloActivos=true').expect(200);
      expect(respuesta.body.total).toBe(2);
    });

    it('pagina y ordena', async () => {
      const respuesta = await listar(
        '?pagina=2&tamano=1&orden=precioReferencial&direccion=desc',
      ).expect(200);
      expect(respuesta.body).toMatchObject({ total: 3, pagina: 2, tamano: 1 });
      expect(respuesta.body.items).toEqual([
        expect.objectContaining({ codigo: 'FE-12' }),
      ]);
    });

    it('tamano mayor a 100 → 400 PAGINACION_INVALIDA', async () => {
      const respuesta = await listar('?tamano=101').expect(400);
      expect(respuesta.body.codigo).toBe('PAGINACION_INVALIDA');
    });

    it('parámetros mal formados → 400 DATOS_INVALIDOS', async () => {
      for (const consulta of [
        '?pagina=0',
        '?tamano=abc',
        '?orden=_id',
        '?direccion=arriba',
        '?soloActivos=si',
      ]) {
        const respuesta = await listar(consulta).expect(400);
        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      }
    });

    it.each(['residente', 'gerente', 'maestro', 'almacenero'])(
      '%s puede consultar el catálogo',
      async (rol) => {
        await listar('', tokens[rol]).expect(200);
      },
    );

    it('cliente (portal) → 403 SIN_PERMISO; sin token → 401', async () => {
      await listar('', tokens.cliente).expect(403);
      await request(servidor()).get('/materiales').expect(401);
    });
  });
});
