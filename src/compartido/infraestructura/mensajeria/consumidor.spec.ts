import {
  CanalPrueba,
  mensajePrueba,
  sobrePrueba,
} from '../../../../test/utilidades/canal-prueba.js';
import {
  COLA,
  COLA_FALLIDOS,
  ConsumidorMensajes,
  type ManejadorMensaje,
} from './consumidor.js';
import type { Inbox } from './inbox.js';
import { MensajeInvalidoError, type Sobre } from './sobre.js';

/** Inbox en memoria (sin MongoDB): recuerda los id ya aplicados. */
class InboxEnMemoria {
  readonly procesados = new Set<string>();

  async procesarUnaVez(
    id: string,
    trabajo: () => Promise<void>,
  ): Promise<boolean> {
    if (this.procesados.has(id)) return false;
    await trabajo();
    this.procesados.add(id);
    return true;
  }
}

class ManejadorPrueba implements ManejadorMensaje {
  readonly recibidos: Sobre[] = [];
  error?: Error;

  manejar(sobre: Sobre): Promise<void> {
    if (this.error) return Promise.reject(this.error);
    this.recibidos.push(sobre);
    return Promise.resolve();
  }
}

describe('ConsumidorMensajes', () => {
  let inbox: InboxEnMemoria;
  let manejador: ManejadorPrueba;
  let consumidor: ConsumidorMensajes;
  let canal: CanalPrueba;

  beforeEach(() => {
    inbox = new InboxEnMemoria();
    manejador = new ManejadorPrueba();
    consumidor = new ConsumidorMensajes(inbox as unknown as Inbox);
    consumidor.registrar('ObraRegistrada', manejador);
    canal = new CanalPrueba();
  });

  it('entrega el mensaje a su manejador y lo confirma', async () => {
    const sobre = sobrePrueba('ObraRegistrada', { obraId: 'o1' });
    const mensaje = mensajePrueba(sobre);

    await consumidor.procesar(mensaje, canal);

    expect(manejador.recibidos).toEqual([sobre]);
    expect(canal.confirmados).toEqual([mensaje]);
    expect(canal.publicados).toEqual([]);
  });

  it('un mensaje repetido se confirma sin aplicarlo otra vez', async () => {
    const sobre = sobrePrueba('ObraRegistrada', { obraId: 'o1' });

    await consumidor.procesar(mensajePrueba(sobre), canal);
    await consumidor.procesar(mensajePrueba(sobre), canal);

    expect(manejador.recibidos).toHaveLength(1);
    expect(canal.confirmados).toHaveLength(2);
    expect(canal.publicados).toEqual([]);
  });

  it('un sobre inválido va directo a plataforma.fallidos', async () => {
    const mensaje = mensajePrueba('{no es json');
    // El doble decodifica el cuerpo como JSON: aquí se mira solo la cola y los encabezados.
    canal.publicarEnCola = (cola, _contenido, opciones) => {
      canal.publicados.push({ cola, cuerpo: null, opciones });
      return Promise.resolve();
    };

    await consumidor.procesar(mensaje, canal);

    expect(canal.publicados).toHaveLength(1);
    expect(canal.publicados[0].cola).toBe(COLA_FALLIDOS);
    expect(canal.publicados[0].opciones.headers).toMatchObject({
      'x-error': 'El mensaje no es JSON.',
      'x-cola-origen': COLA,
      'x-clave-origen': 'evento.obras.ObraRegistrada',
    });
    expect(canal.confirmados).toEqual([mensaje]);
  });

  it('datos incompletos (MensajeInvalidoError) van directo a plataforma.fallidos', async () => {
    manejador.error = new MensajeInvalidoError('Falta obraId.');
    const sobre = sobrePrueba('ObraRegistrada', {});

    await consumidor.procesar(mensajePrueba(sobre), canal);

    expect(canal.publicados).toEqual([
      expect.objectContaining({
        cola: COLA_FALLIDOS,
        cuerpo: sobre,
        opciones: expect.objectContaining({
          persistent: true,
          headers: expect.objectContaining({
            'x-intentos': 0,
            'x-error': 'Falta obraId.',
          }),
        }),
      }),
    ]);
    expect(canal.confirmados).toHaveLength(1);
    expect(inbox.procesados.size).toBe(0);
  });

  it.each(['CerrarConsumos', 'ReabrirConsumos'])(
    'un tipo sin manejador (%s, de la 008) se guarda en plataforma.fallidos',
    async (tipo) => {
      const sobre = sobrePrueba(tipo, {
        planillaId: 'p1',
        obraId: 'o1',
        periodo: '2026-11',
      });

      await consumidor.procesar(
        mensajePrueba(sobre, `comando.materiales.${tipo}`),
        canal,
      );

      expect(canal.publicados).toHaveLength(1);
      expect(canal.publicados[0]).toMatchObject({
        cola: COLA_FALLIDOS,
        cuerpo: sobre,
        opciones: {
          headers: {
            'x-error': `Materiales todavía no procesa mensajes de tipo ${tipo}.`,
            'x-clave-origen': `comando.materiales.${tipo}`,
          },
        },
      });
      expect(canal.confirmados).toHaveLength(1);
    },
  );

  it('si el manejador falla, se vuelve a publicar en la cola con x-intentos + 1', async () => {
    manejador.error = new Error('MongoDB no responde');
    const sobre = sobrePrueba('ObraRegistrada', { obraId: 'o1' });
    const mensaje = mensajePrueba(sobre);

    await consumidor.procesar(mensaje, canal);

    expect(canal.publicados).toHaveLength(1);
    expect(canal.publicados[0]).toMatchObject({
      cola: COLA,
      cuerpo: sobre,
      opciones: {
        persistent: true,
        headers: {
          'x-intentos': 1,
          'x-error': 'MongoDB no responde',
          'x-clave-origen': 'evento.obras.ObraRegistrada',
        },
      },
    });
    expect(canal.confirmados).toEqual([mensaje]);
  });

  it('el segundo fallo vuelve a la cola con x-intentos 2', async () => {
    manejador.error = new Error('MongoDB no responde');
    const sobre = sobrePrueba('ObraRegistrada', { obraId: 'o1' });

    await consumidor.procesar(
      mensajePrueba(sobre, COLA, {
        'x-intentos': 1,
        'x-clave-origen': 'evento.obras.ObraRegistrada',
      }),
      canal,
    );

    expect(canal.publicados[0]).toMatchObject({
      cola: COLA,
      opciones: {
        headers: {
          'x-intentos': 2,
          // Se conserva la clave original aunque el reintento llegó por el exchange por defecto.
          'x-clave-origen': 'evento.obras.ObraRegistrada',
        },
      },
    });
  });

  it('al tercer fallo va a plataforma.fallidos con el error', async () => {
    manejador.error = new Error('MongoDB no responde');
    const sobre = sobrePrueba('ObraRegistrada', { obraId: 'o1' });

    await consumidor.procesar(
      mensajePrueba(sobre, COLA, {
        'x-intentos': 2,
        'x-clave-origen': 'evento.obras.ObraRegistrada',
      }),
      canal,
    );

    expect(canal.publicados).toHaveLength(1);
    expect(canal.publicados[0]).toMatchObject({
      cola: COLA_FALLIDOS,
      cuerpo: sobre,
      opciones: {
        headers: {
          'x-intentos': 3,
          'x-error': 'MongoDB no responde',
          'x-cola-origen': COLA,
          'x-clave-origen': 'evento.obras.ObraRegistrada',
        },
      },
    });
    expect(canal.confirmados).toHaveLength(1);
  });

  it('si no puede publicar el reintento, no confirma el original', async () => {
    manejador.error = new Error('MongoDB no responde');
    canal.fallarAlPublicar = new Error('canal cerrado');

    await expect(
      consumidor.procesar(
        mensajePrueba(sobrePrueba('ObraRegistrada', { obraId: 'o1' })),
        canal,
      ),
    ).rejects.toThrow('canal cerrado');
    expect(canal.confirmados).toEqual([]);
  });

  it('no permite dos manejadores para el mismo tipo', () => {
    expect(() =>
      consumidor.registrar('ObraRegistrada', new ManejadorPrueba()),
    ).toThrow();
  });
});
