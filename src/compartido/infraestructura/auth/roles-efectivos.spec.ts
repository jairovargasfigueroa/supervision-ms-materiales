import { rolesEfectivos } from './roles-efectivos.js';

describe('rolesEfectivos', () => {
  it('con azp portal solo cuenta cliente', () => {
    expect(rolesEfectivos(['residente', 'cliente'], 'portal')).toEqual([
      'cliente',
    ]);
  });

  it('con azp portal y sin cliente no queda ningún rol', () => {
    expect(rolesEfectivos(['admin'], 'portal')).toEqual([]);
  });

  it.each(['erp', 'app-obra'])(
    'con azp %s solo cuentan los roles internos',
    (azp) => {
      expect(
        rolesEfectivos(
          [
            'admin',
            'residente',
            'gerente',
            'maestro',
            'almacenero',
            'cliente',
            'offline_access',
          ],
          azp,
        ),
      ).toEqual(['admin', 'residente', 'gerente', 'maestro', 'almacenero']);
    },
  );

  it('demo1 (residente y cliente) con azp erp solo es residente', () => {
    expect(rolesEfectivos(['residente', 'cliente'], 'erp')).toEqual([
      'residente',
    ]);
  });

  it('cliente con azp erp no cuenta como cliente', () => {
    expect(rolesEfectivos(['cliente'], 'erp')).toEqual([]);
  });

  it.each(['gateway', 'ia-agentes', 'n8n'])(
    'con un cliente de servicio (%s) deja los roles tal cual',
    (azp) => {
      expect(rolesEfectivos(['agente_ia', 'cliente'], azp)).toEqual([
        'agente_ia',
        'cliente',
      ]);
    },
  );

  it('sin azp deja los roles tal cual', () => {
    expect(rolesEfectivos(['automatizacion'], undefined)).toEqual([
      'automatizacion',
    ]);
  });

  it('no modifica la lista recibida', () => {
    const roles = ['residente', 'cliente'];
    rolesEfectivos(roles, 'portal');
    expect(roles).toEqual(['residente', 'cliente']);
  });
});
