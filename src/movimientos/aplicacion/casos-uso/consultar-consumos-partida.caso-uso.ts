import { Inject, Injectable } from '@nestjs/common';
import { AccesoObraServicio } from '../../../acceso-obra/aplicacion/acceso-obra.servicio.js';
import type { ObraAcceso } from '../../../acceso-obra/dominio/obra-acceso.js';
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
  /** Sin él, todas las obras que el usuario ve (lote, 505). */
  obraId?: string;
  /** `AAAA-MM`. */
  periodo: string;
  /** Solo esa partida, si viene. */
  partidaId?: string;
  /** Filas máximas. */
  limite: number;
}

/**
 * Las salidas de una partida y material de una obra, con los datos del material del catálogo y el
 * nombre de la obra (de `obra_acceso`).
 */
export interface FilaConsumoPartida {
  resumen: ResumenSalidasPartida;
  material: Material;
  obraNombre: string;
}

export interface ConsumosPartida {
  /**
   * Con `obraId`: hay `cierre_periodo` `CERRADO` para la obra y el periodo (008). En el lote,
   * `null` (el cierre es por obra).
   */
  cerrado: boolean | null;
  filas: FilaConsumoPartida[];
  truncado: boolean;
}

/**
 * Material usado por partida y material en un periodo, para la herramienta MCP `consumos_partida`
 * (501): la misma suma de salidas que `GET /obras/{obraId}/consumos` (006), con el número de
 * salidas, cuántas superaron el stock y el nombre de la obra.
 *
 * - Con `obraId`: esa obra y si el periodo está cerrado. Si el usuario no la ve (o no está en
 *   `obra_acceso`), `404 OBRA_NO_ENCONTRADA`.
 * - Sin `obraId` (lote, 505): las obras de `obra_acceso` que el usuario ve (`agente_ia`: todas),
 *   solo las que tienen salidas en el periodo; `cerrado` es `null`. Nunca lee otras obras.
 *
 * Orden por obra, partida y material; recorta a `limite`. Solo lectura.
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
    const obras: ObraAcceso[] = obraId
      ? [await this.acceso.exigirVer(obraId, usuario)]
      : await this.acceso.listarVisibles(usuario);
    if (obras.length === 0)
      return { cerrado: null, filas: [], truncado: false };

    const nombres = new Map(obras.map((obra) => [obra.obraId, obra.nombre]));
    const [resumenes, cerrado] = await Promise.all([
      this.movimientos.resumirSalidas([...nombres.keys()], periodo, partidaId),
      obraId ? this.cierres.estaCerrado(obraId, periodo) : null,
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
      filas: recortados.flatMap((resumen) => {
        // Los materiales no se borran (003, criterio 5): siempre está en el catálogo.
        const material = materiales.get(resumen.materialId);
        const obraNombre = nombres.get(resumen.obraId);
        return material && obraNombre !== undefined
          ? [{ resumen, material, obraNombre }]
          : [];
      }),
      truncado: resumenes.length > limite,
    };
  }
}
