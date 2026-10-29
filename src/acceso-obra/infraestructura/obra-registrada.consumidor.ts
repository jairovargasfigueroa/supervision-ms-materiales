import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ConsumidorMensajes,
  type ManejadorMensaje,
} from '../../compartido/infraestructura/mensajeria/consumidor.js';
import {
  esObjeto,
  esTextoNoVacio,
  MensajeInvalidoError,
  type Sobre,
} from '../../compartido/infraestructura/mensajeria/sobre.js';
import {
  RegistrarObraAccesoCasoUso,
  type RegistrarObraAccesoEntrada,
} from '../aplicacion/casos-uso/registrar-obra-acceso.caso-uso.js';

export const TIPO_OBRA_REGISTRADA = 'ObraRegistrada';

const CAMPOS_ASIGNACIONES = [
  'residenteId',
  'maestroId',
  'almaceneroId',
  'clienteId',
] as const;

/**
 * Escucha `evento.obras.ObraRegistrada` y guarda `obra_acceso`. Lee solo `obraId`, `nombre` y
 * `asignaciones` (lector tolerante: `fechaInicio`, `contrato` y campos desconocidos se ignoran).
 * Idempotente por el inbox (`id` del mensaje) y por `obraId` (upsert).
 */
@Injectable()
export class ObraRegistradaConsumidor
  implements ManejadorMensaje, OnModuleInit
{
  constructor(
    private readonly consumidor: ConsumidorMensajes,
    private readonly registrarObraAcceso: RegistrarObraAccesoCasoUso,
  ) {}

  onModuleInit(): void {
    this.consumidor.registrar(TIPO_OBRA_REGISTRADA, this);
  }

  async manejar(sobre: Sobre): Promise<void> {
    await this.registrarObraAcceso.ejecutar(leerDatos(sobre.datos));
  }
}

/** Valida `datos` de `ObraRegistrada`; si falta algo, `MensajeInvalidoError` (va a fallidos). */
export function leerDatos(
  datos: Record<string, unknown>,
): RegistrarObraAccesoEntrada {
  const faltan: string[] = [];
  if (!esTextoNoVacio(datos.obraId)) faltan.push('obraId');
  if (!esTextoNoVacio(datos.nombre)) faltan.push('nombre');
  const asignaciones = esObjeto(datos.asignaciones) ? datos.asignaciones : {};
  for (const campo of CAMPOS_ASIGNACIONES) {
    if (!esTextoNoVacio(asignaciones[campo])) {
      faltan.push(`asignaciones.${campo}`);
    }
  }
  if (faltan.length > 0) {
    throw new MensajeInvalidoError(
      `ObraRegistrada con datos incompletos: falta ${faltan.join(', ')}.`,
    );
  }
  return {
    obraId: datos.obraId as string,
    nombre: datos.nombre as string,
    asignaciones: {
      residenteId: asignaciones.residenteId as string,
      maestroId: asignaciones.maestroId as string,
      almaceneroId: asignaciones.almaceneroId as string,
      clienteId: asignaciones.clienteId as string,
    },
  };
}
