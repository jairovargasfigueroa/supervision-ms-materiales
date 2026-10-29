import { datosObraRegistrada } from '../../../test/utilidades/canal-prueba.js';
import { ObraAccesoRepositorioMemoria } from '../../../test/utilidades/obra-acceso-memoria.js';
import type { ConsumidorMensajes } from '../../compartido/infraestructura/mensajeria/consumidor.js';
import { MensajeInvalidoError } from '../../compartido/infraestructura/mensajeria/sobre.js';
import { RegistrarObraAccesoCasoUso } from '../aplicacion/casos-uso/registrar-obra-acceso.caso-uso.js';
import {
  leerDatos,
  ObraRegistradaConsumidor,
} from './obra-registrada.consumidor.js';

describe('ObraRegistradaConsumidor', () => {
  let repositorio: ObraAccesoRepositorioMemoria;
  let manejador: ObraRegistradaConsumidor;
  const registrados: string[] = [];

  beforeEach(() => {
    repositorio = new ObraAccesoRepositorioMemoria();
    registrados.length = 0;
    const consumidor = {
      registrar: (tipo: string) => registrados.push(tipo),
    } as unknown as ConsumidorMensajes;
    manejador = new ObraRegistradaConsumidor(
      consumidor,
      new RegistrarObraAccesoCasoUso(repositorio),
    );
    manejador.onModuleInit();
  });

  const sobre = (datos: Record<string, unknown>) => ({
    id: 'm1',
    tipo: 'ObraRegistrada',
    version: 1,
    datos,
  });

  it('se registra para el tipo ObraRegistrada', () => {
    expect(registrados).toEqual(['ObraRegistrada']);
  });

  it('guarda obraId, nombre y asignaciones', async () => {
    await manejador.manejar(sobre(datosObraRegistrada()));

    const obra = repositorio.obras.get('b2c3d4e5-0000-4000-8000-000000000001');
    expect(obra).toMatchObject({
      nombre: 'Edificio Las Palmas',
      asignaciones: {
        residenteId: 'residente-1',
        maestroId: 'maestro-1',
        almaceneroId: 'almacenero-1',
        clienteId: 'cliente-1',
      },
    });
    expect(obra?.actualizadoEn).toBeInstanceOf(Date);
  });

  it('la misma obra otra vez reemplaza la copia (no duplica)', async () => {
    await manejador.manejar(sobre(datosObraRegistrada()));
    await manejador.manejar(
      sobre(datosObraRegistrada({ nombre: 'Edificio Las Palmas II' })),
    );

    expect(repositorio.obras.size).toBe(1);
    expect(
      repositorio.obras.get('b2c3d4e5-0000-4000-8000-000000000001')?.nombre,
    ).toBe('Edificio Las Palmas II');
  });
});

describe('leerDatos de ObraRegistrada', () => {
  it('ignora fechaInicio, contrato y campos desconocidos', () => {
    expect(leerDatos(datosObraRegistrada({ otro: 1 }))).toEqual({
      obraId: 'b2c3d4e5-0000-4000-8000-000000000001',
      nombre: 'Edificio Las Palmas',
      asignaciones: {
        residenteId: 'residente-1',
        maestroId: 'maestro-1',
        almaceneroId: 'almacenero-1',
        clienteId: 'cliente-1',
      },
    });
  });

  it('acepta un mensaje sin contrato ni fechaInicio', () => {
    expect(() =>
      leerDatos(
        datosObraRegistrada({ contrato: undefined, fechaInicio: undefined }),
      ),
    ).not.toThrow();
  });

  it.each([
    ['obraId', { obraId: undefined }, 'obraId'],
    ['nombre vacío', { nombre: '' }, 'nombre'],
    ['asignaciones', { asignaciones: undefined }, 'asignaciones.residenteId'],
    [
      'almaceneroId',
      {
        asignaciones: {
          residenteId: 'r',
          maestroId: 'm',
          clienteId: 'c',
        },
      },
      'asignaciones.almaceneroId',
    ],
  ])('sin %s lanza MensajeInvalidoError', (_caso, cambios, campo) => {
    expect(() => leerDatos(datosObraRegistrada(cambios))).toThrow(
      MensajeInvalidoError,
    );
    expect(() => leerDatos(datosObraRegistrada(cambios))).toThrow(campo);
  });
});
