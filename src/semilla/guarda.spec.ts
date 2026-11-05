import {
  esSemillaDemo,
  GuardaSemillaError,
  hostsDeUri,
  verificarGuarda,
} from './guarda.js';

const LOCAL = 'mongodb://localhost:27017/materiales_db?replicaSet=rs0';

describe('guarda de la semilla (011)', () => {
  it.each([
    [undefined, LOCAL],
    ['development', LOCAL],
    ['test', 'mongodb://127.0.0.1:51234/materiales_db'],
    [undefined, 'mongodb://mongo:27017/materiales_db?replicaSet=rs0'],
    [undefined, 'mongodb://usuario:cl%40ve@localhost/materiales_db'],
    [undefined, 'mongodb://[::1]:27017/materiales_db'],
    [undefined, 'mongodb://localhost:27017,127.0.0.1:27018/db?replicaSet=rs0'],
  ])('permite NODE_ENV=%s con %s', (nodeEnv, mongoUri) => {
    expect(() => verificarGuarda({ nodeEnv, mongoUri })).not.toThrow();
  });

  it.each(['production', 'PRODUCTION', ' production '])(
    'rechaza NODE_ENV=%s',
    (nodeEnv) => {
      expect(() => verificarGuarda({ nodeEnv, mongoUri: LOCAL })).toThrow(
        /NODE_ENV=production/,
      );
    },
  );

  it.each([
    'mongodb://cluster0.abcde.mongodb.net:27017/materiales_db',
    'mongodb://10.0.0.5:27017/materiales_db',
    'mongodb://localhost:27017,db.remoto.com:27017/db?replicaSet=rs0',
    'mongodb://usuario:clave@db.remoto.com/materiales_db',
    'mongodb+srv://usuario:clave@cluster0.abcde.mongodb.net/materiales_db',
    'mongodb://localhost.remoto.com/materiales_db',
  ])('rechaza la base no local %s', (mongoUri) => {
    expect(() => verificarGuarda({ nodeEnv: undefined, mongoUri })).toThrow(
      GuardaSemillaError,
    );
  });

  it.each([undefined, '', 'postgres://localhost/db', 'materiales_db'])(
    'rechaza MONGODB_URI vacía o que no es de MongoDB (%s)',
    (mongoUri) => {
      expect(() => verificarGuarda({ nodeEnv: undefined, mongoUri })).toThrow(
        GuardaSemillaError,
      );
    },
  );

  it('sin SEMILLA_DEMO devuelve false (no usó la excepción)', () => {
    expect(
      verificarGuarda({
        nodeEnv: 'development',
        mongoUri: LOCAL,
        modo: 'cargar',
      }),
    ).toBe(false);
  });

  describe('SEMILLA_DEMO=si (601)', () => {
    const REMOTA = 'mongodb+srv://u:p@cluster0.abcde.mongodb.net/materiales_db';

    it.each([
      ['production', LOCAL],
      ['production', REMOTA],
      [undefined, 'mongodb://10.0.0.5:27017/materiales_db'],
    ])('permite cargar con NODE_ENV=%s y %s', (nodeEnv, mongoUri) => {
      expect(
        verificarGuarda({
          nodeEnv,
          mongoUri,
          semillaDemo: 'si',
          modo: 'cargar',
        }),
      ).toBe(true);
    });

    it.each(['vaciar', undefined] as const)(
      'nunca permite el modo %s fuera de desarrollo',
      (modo) => {
        expect(() =>
          verificarGuarda({
            nodeEnv: 'production',
            mongoUri: LOCAL,
            semillaDemo: 'si',
            modo,
          }),
        ).toThrow(GuardaSemillaError);
        expect(() =>
          verificarGuarda({
            nodeEnv: undefined,
            mongoUri: REMOTA,
            semillaDemo: 'si',
            modo,
          }),
        ).toThrow(GuardaSemillaError);
      },
    );

    it.each([undefined, '', 'postgres://db/x'])(
      'sigue exigiendo una MONGODB_URI de MongoDB (%s)',
      (mongoUri) => {
        expect(() =>
          verificarGuarda({
            nodeEnv: 'production',
            mongoUri,
            semillaDemo: 'si',
            modo: 'cargar',
          }),
        ).toThrow(GuardaSemillaError);
      },
    );

    it('solo «si» habilita la excepción', () => {
      expect(['si', 'SI', ' si '].map(esSemillaDemo)).toEqual([
        true,
        true,
        true,
      ]);
      expect(
        [undefined, '', 'no', 'true', 'sí', '1'].map(esSemillaDemo),
      ).toEqual([false, false, false, false, false, false]);
      expect(() =>
        verificarGuarda({
          nodeEnv: 'production',
          mongoUri: LOCAL,
          semillaDemo: 'true',
          modo: 'cargar',
        }),
      ).toThrow(/NODE_ENV=production/);
    });
  });

  it('hostsDeUri saca los hosts sin credenciales ni puerto', () => {
    expect(
      hostsDeUri('mongodb://u:p@LocalHost:27017,[::1]:27018/db?replicaSet=rs0'),
    ).toEqual(['localhost', '::1']);
  });
});
