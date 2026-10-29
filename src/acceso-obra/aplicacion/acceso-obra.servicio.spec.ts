import { ObraAccesoRepositorioMemoria } from '../../../test/utilidades/obra-acceso-memoria.js';
import { ReglaNegocioError } from '../../compartido/dominio/regla-negocio.error.js';
import type { UsuarioAutenticado } from '../../compartido/infraestructura/auth/usuario-autenticado.js';
import { ObraAcceso } from '../dominio/obra-acceso.js';
import { AccesoObraServicio } from './acceso-obra.servicio.js';

const OBRA = 'obra-1';
const OTRA = 'obra-2';

const usuario = (
  id: string,
  roles: string[],
  azp = 'erp',
): UsuarioAutenticado => ({ id, roles, azp });

describe('AccesoObraServicio', () => {
  let repositorio: ObraAccesoRepositorioMemoria;
  let servicio: AccesoObraServicio;

  beforeEach(async () => {
    repositorio = new ObraAccesoRepositorioMemoria();
    servicio = new AccesoObraServicio(repositorio);
    await repositorio.guardar(
      new ObraAcceso(
        OBRA,
        'Edificio Las Palmas',
        {
          residenteId: 'res-1',
          maestroId: 'mae-1',
          almaceneroId: 'alm-1',
          clienteId: 'cli-1',
        },
        new Date(),
      ),
    );
    await repositorio.guardar(
      new ObraAcceso(
        OTRA,
        'Casa Equipetrol',
        {
          residenteId: 'res-2',
          maestroId: 'mae-2',
          almaceneroId: 'alm-2',
          clienteId: 'cli-2',
        },
        new Date(),
      ),
    );
  });

  describe('puedeVer', () => {
    it.each([
      ['admin', usuario('cualquiera', ['admin'])],
      ['gerente', usuario('cualquiera', ['gerente'])],
      ['residente asignado', usuario('res-1', ['residente'])],
      ['maestro asignado', usuario('mae-1', ['maestro'], 'app-obra')],
      ['almacenero asignado', usuario('alm-1', ['almacenero'], 'app-obra')],
      ['cliente de la obra (portal)', usuario('cli-1', ['cliente'], 'portal')],
    ])('%s la ve', async (_caso, quien) => {
      await expect(servicio.puedeVer(OBRA, quien)).resolves.toBe(true);
    });

    it.each([
      ['residente de otra obra', usuario('res-2', ['residente'])],
      ['maestro de otra obra', usuario('mae-2', ['maestro'], 'app-obra')],
      ['almacenero de otra obra', usuario('alm-2', ['almacenero'], 'app-obra')],
      ['otro cliente', usuario('cli-2', ['cliente'], 'portal')],
      // Asignado como maestro, pero entra con otro rol: cuenta el rol, no solo el id.
      ['id de maestro con rol residente', usuario('mae-1', ['residente'])],
      // demo1 (residente y cliente) en el portal: solo cuenta cliente (azp).
      [
        'residente asignado entrando desde el portal',
        usuario('res-1', ['residente', 'cliente'], 'portal'),
      ],
      // Cliente de la obra entrando desde el ERP: no cuenta cliente (azp).
      ['cliente de la obra desde el ERP', usuario('cli-1', ['cliente'], 'erp')],
      ['admin desde el portal', usuario('x', ['admin'], 'portal')],
      ['sin roles', usuario('res-1', [])],
    ])('%s no la ve', async (_caso, quien) => {
      await expect(servicio.puedeVer(OBRA, quien)).resolves.toBe(false);
    });

    it('nadie ve una obra que no está en obra_acceso, ni el admin', async () => {
      await expect(
        servicio.puedeVer('no-existe', usuario('a', ['admin'])),
      ).resolves.toBe(false);
    });

    it('un cliente de servicio (gateway) usa los roles del token tal cual', async () => {
      await expect(
        servicio.puedeVer(OBRA, usuario('svc', ['gerente'], 'gateway')),
      ).resolves.toBe(true);
    });
  });

  describe('exigirVer', () => {
    it('devuelve la obra si la ve', async () => {
      await expect(
        servicio.exigirVer(OBRA, usuario('res-1', ['residente'])),
      ).resolves.toMatchObject({ obraId: OBRA, nombre: 'Edificio Las Palmas' });
    });

    it.each([
      ['no la ve', OBRA, usuario('res-2', ['residente'])],
      ['no existe', 'no-existe', usuario('a', ['admin'])],
    ])(
      'responde 404 OBRA_NO_ENCONTRADA si %s',
      async (_caso, obraId, quien) => {
        const error = await servicio
          .exigirVer(obraId, quien)
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ReglaNegocioError);
        expect(error).toMatchObject({
          codigo: 'OBRA_NO_ENCONTRADA',
          status: 404,
        });
      },
    );
  });

  describe('exigirRegistrarMovimientos', () => {
    it('el almacenero asignado puede', async () => {
      await expect(
        servicio.exigirRegistrarMovimientos(
          OBRA,
          usuario('alm-1', ['almacenero'], 'app-obra'),
        ),
      ).resolves.toMatchObject({ obraId: OBRA });
    });

    it.each([
      ['almacenero de otra obra', OBRA, 'alm-2'],
      ['obra que no existe', 'no-existe', 'alm-1'],
    ])('%s: 404 OBRA_NO_ENCONTRADA', async (_caso, obraId, id) => {
      await expect(
        servicio.exigirRegistrarMovimientos(
          obraId,
          usuario(id, ['almacenero'], 'app-obra'),
        ),
      ).rejects.toMatchObject({ codigo: 'OBRA_NO_ENCONTRADA', status: 404 });
    });

    it.each([
      ['admin', usuario('a', ['admin'])],
      ['maestro asignado', usuario('mae-1', ['maestro'], 'app-obra')],
      ['residente asignado', usuario('res-1', ['residente'])],
    ])('%s: 403 SIN_PERMISO', async (_caso, quien) => {
      await expect(
        servicio.exigirRegistrarMovimientos(OBRA, quien),
      ).rejects.toMatchObject({ codigo: 'SIN_PERMISO', status: 403 });
    });
  });

  describe('filtrarVisibles', () => {
    it('admin ve las que existen, sin repetir y en el mismo orden', async () => {
      await expect(
        servicio.filtrarVisibles(
          [OTRA, 'no-existe', OBRA, OTRA],
          usuario('a', ['admin']),
        ),
      ).resolves.toEqual([OTRA, OBRA]);
    });

    it('el residente solo ve las suyas', async () => {
      await expect(
        servicio.filtrarVisibles([OBRA, OTRA], usuario('res-2', ['residente'])),
      ).resolves.toEqual([OTRA]);
    });

    it('una lista vacía devuelve vacía', async () => {
      await expect(
        servicio.filtrarVisibles([], usuario('a', ['admin'])),
      ).resolves.toEqual([]);
    });
  });
});
