import { Inject, Injectable } from '@nestjs/common';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import {
  MATERIAL_REPOSITORIO,
  type MaterialRepositorio,
} from '../../../catalogo/aplicacion/puertos/material.repositorio.js';
import type { Material } from '../../../catalogo/dominio/material.js';
import {
  CIERRE_PERIODO_REPOSITORIO,
  type CierrePeriodoRepositorio,
} from '../../../cierres/aplicacion/puertos/cierre-periodo.repositorio.js';
import type { UsuarioAutenticado } from '../../../compartido/infraestructura/auth/usuario-autenticado.js';
import type { ResumenSalidasPartida } from '../../dominio/consumo.js';
import {
  MOVIMIENTO_REPOSITORIO,
  type MovimientoRepositorio,
} from '../puertos/movimiento.repositorio.js';

export interface ConsultaConsumosPartida {
  obraId: string;
  /** `AAAA-MM`. */
  periodo: string;
  /** Solo esa partida, si viene. */
  partidaId?: string;
  /** Filas máximas. */
  limite: number;
}

/** Las salidas de una partida y material, con los datos del material del catálogo. */
export interface FilaConsumoPartida {
  resumen: ResumenSalidasPartida;
  material: Material;
}

export interface ConsumosPartida {
  /** Hay `cierre_periodo` `CERRADO` para la obra y el periodo (008). */
  cerrado: boolean;
  filas: FilaConsumoPartida[];
  truncado: boolean;
}

/**
 * Material usado por partida y material de una obra en un periodo, para la herramienta MCP
 * `consumos_partida` (501): la misma suma de salidas que `GET /obras/{obraId}/consumos` (006),
 * con el número de salidas, cuántas superaron el stock y si el periodo está cerrado. Si el usuario
 * no ve la obra (o no está en `obra_acceso`), `404 OBRA_NO_ENCONTRADA`. Solo lectura.
 */
@Injectable()
export class ConsultarConsumosPartidaCasoUso {
  constructor(
    private readonly acceso: AccesoObraServicio,
    @Inject(MOVIMIENTO_REPOSITORIO)
    private readonly movimientos: MovimientoRepositorio,
    @Inject(CIERRE_PERIODO_REPOSITORIO)
    private readonly cierres: CierrePeriodoRepositorio,
    @Inject(MATERIAL_REPOSITORIO)
    private readonly materiales: MaterialRepositorio,
  ) {}

  async ejecutar(
    consulta: ConsultaConsumosPartida,
    usuario: UsuarioAutenticado,
  ): Promise<ConsumosPartida> {
    const { obraId, periodo, partidaId, limite } = consulta;
    await this.acceso.exigirVer(obraId, usuario);
    const [resumenes, cerrado] = await Promise.all([
      this.movimientos.resumirSalidas(obraId, periodo, partidaId),
      this.cierres.estaCerrado(obraId, periodo),
    ]);
    const recortados = resumenes.slice(0, limite);
    const materiales = new Map(
      (
        await this.materiales.buscarVarios([
          ...new Set(recortados.map((r) => r.materialId)),
        ])
      ).map((material) => [material.id, material]),
    );
    return {
      cerrado,
      // Los materiales no se borran (003, criterio 5): siempre está en el catálogo.
      filas: recortados.flatMap((resumen) => {
        const material = materiales.get(resumen.materialId);
        return material ? [{ resumen, material }] : [];
      }),
      truncado: resumenes.length > limite,
    };
  }
}
