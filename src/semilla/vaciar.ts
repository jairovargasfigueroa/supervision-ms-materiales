import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import {
  sesionActual,
  Transaccion,
} from '../compartido/infraestructura/mongo/transaccion.js';
import { COLECCIONES_SEMILLA } from './cargar-semilla.js';
import { verificarGuarda } from './guarda.js';

/**
 * Todas las colecciones del negocio de Materiales (`docs/datos.md`): las que carga la semilla y
 * las del outbox y el inbox, para que después de `recargar` no queden eventos ni mensajes viejos
 * que apunten a datos borrados. MongoDB no tiene historial de migraciones que conservar.
 */
export const COLECCIONES_NEGOCIO = [
  ...COLECCIONES_SEMILLA,
  'outbox_evento',
  'mensaje_procesado',
] as const;
export type ColeccionNegocio = (typeof COLECCIONES_NEGOCIO)[number];

/**
 * Vacía las colecciones del negocio (011, `npm run semilla:vaciar`) en una transacción. Borra los
 * documentos y deja las colecciones y sus índices.
 *
 * Antes de borrar vuelve a pedir la guarda estricta: el vaciado nunca corre en producción ni
 * contra una base que no es local, tampoco con `SEMILLA_DEMO=si` (601).
 */
@Injectable()
export class VaciarSemilla {
  constructor(
    @InjectConnection() private readonly conexion: Connection,
    private readonly transaccion: Transaccion,
    private readonly config: ConfigService,
  ) {}

  /** Cuántos documentos se borraron de cada colección. */
  async ejecutar(): Promise<Record<ColeccionNegocio, number>> {
    verificarGuarda({
      nodeEnv: this.config.get<string>('NODE_ENV'),
      mongoUri: this.config.get<string>('MONGODB_URI'),
      modo: 'vaciar',
    });
    return this.transaccion.ejecutar(async () => {
      const borrados = {} as Record<ColeccionNegocio, number>;
      for (const coleccion of COLECCIONES_NEGOCIO) {
        const resultado = await this.conexion
          .collection(coleccion)
          .deleteMany({}, { session: sesionActual() ?? undefined });
        borrados[coleccion] = resultado.deletedCount;
      }
      return borrados;
    });
  }
}
