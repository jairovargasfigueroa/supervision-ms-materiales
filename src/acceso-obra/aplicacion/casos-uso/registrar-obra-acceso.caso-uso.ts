import { Inject, Injectable } from '@nestjs/common';
import { type Asignaciones, ObraAcceso } from '../../dominio/obra-acceso.js';
import {
  OBRA_ACCESO_REPOSITORIO,
  type ObraAccesoRepositorio,
} from '../puertos/obra-acceso.repositorio.js';

export interface RegistrarObraAccesoEntrada {
  obraId: string;
  nombre: string;
  asignaciones: Asignaciones;
}

/**
 * Guarda (o reemplaza) la copia de las asignaciones de una obra registrada en Obras (002,
 * criterio 11), para que el almacenero asignado pueda registrar movimientos en ella.
 */
@Injectable()
export class RegistrarObraAccesoCasoUso {
  constructor(
    @Inject(OBRA_ACCESO_REPOSITORIO)
    private readonly obras: ObraAccesoRepositorio,
  ) {}

  async ejecutar(entrada: RegistrarObraAccesoEntrada): Promise<void> {
    await this.obras.guardar(
      new ObraAcceso(
        entrada.obraId,
        entrada.nombre,
        { ...entrada.asignaciones },
        new Date(),
      ),
    );
  }
}
