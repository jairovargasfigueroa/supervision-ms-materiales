import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { Roles } from '../../compartido/infraestructura/auth/roles.decorator.js';
import { ROLES_INTERNOS } from '../../compartido/infraestructura/auth/roles-efectivos.js';
import { UsuarioActual } from '../../compartido/infraestructura/auth/usuario-actual.decorator.js';
import type { UsuarioAutenticado } from '../../compartido/infraestructura/auth/usuario-autenticado.js';
import type { Solicitud } from '../../compartido/infraestructura/http/solicitud.js';
import { FijarMinimoCasoUso } from '../aplicacion/casos-uso/fijar-minimo.caso-uso.js';
import { ListarStockObraCasoUso } from '../aplicacion/casos-uso/listar-stock-obra.caso-uso.js';
import { FijarMinimoDto } from './dto/fijar-minimo.dto.js';
import { StockRespuesta } from './dto/stock.respuesta.js';

/**
 * Stock por obra (003). Lectura: internos que ven la obra (`obra_acceso`); fijar el mínimo: solo
 * `admin`.
 */
@Controller('obras/:obraId/stock')
export class StockController {
  constructor(
    private readonly listarStock: ListarStockObraCasoUso,
    private readonly fijarMinimoCasoUso: FijarMinimoCasoUso,
  ) {}

  @Get()
  @Roles(...ROLES_INTERNOS)
  async listar(
    @Param('obraId') obraId: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<StockRespuesta[]> {
    const filas = await this.listarStock.ejecutar(obraId, usuario);
    return filas.map(StockRespuesta.desde);
  }

  @Put(':materialId/minimo')
  @Roles('admin')
  async fijarMinimo(
    @Param('obraId') obraId: string,
    @Param('materialId') materialId: string,
    @Body() dto: FijarMinimoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() solicitud: Solicitud,
  ): Promise<StockRespuesta> {
    return StockRespuesta.desde(
      await this.fijarMinimoCasoUso.ejecutar(
        obraId,
        materialId,
        dto.minimo,
        usuario,
        // El `X-Request-Id` es el correlacionId del evento StockBajo (si es un UUID).
        solicitud.requestId,
      ),
    );
  }
}
