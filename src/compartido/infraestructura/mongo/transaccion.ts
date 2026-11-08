import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { ClientSession, Connection } from 'mongoose';

const sesiones = new AsyncLocalStorage<ClientSession>();

/**
 * Sesión de la transacción en curso, o `null` fuera de una. Cada repositorio de Mongo la pasa a
 * sus operaciones (`.session(sesionActual())` o `{ session: sesionActual() }`), así el caso de uso
 * no conoce MongoDB y sus escrituras entran en la transacción que abrió quien lo llamó.
 */
export function sesionActual(): ClientSession | null {
  return sesiones.getStore() ?? null;
}

/**
 * Ejecuta varias escrituras en una transacción de MongoDB (requiere *replica set*, también en
 * desarrollo). Si la transacción falla por un error pasajero (conflicto de escritura), el driver
 * la vuelve a ejecutar completa: `trabajo` tiene que poder repetirse.
 */
@Injectable()
export class Transaccion {
  constructor(@InjectConnection() private readonly conexion: Connection) {}

  async ejecutar<T>(trabajo: () => Promise<T>): Promise<T> {
    // Una transacción dentro de otra usa la misma sesión.
    if (sesionActual()) return trabajo();

    const sesion = await this.conexion.startSession();
    try {
      let resultado: T | undefined;
      await sesion.withTransaction(async () => {
        resultado = await sesiones.run(sesion, trabajo);
      });
      return resultado as T;
    } finally {
      await sesion.endSession();
    }
  }
}
