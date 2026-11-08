import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../compartido/infraestructura/auth/roles.decorator.js';
import { UsuarioActual } from '../../compartido/infraestructura/auth/usuario-actual.decorator.js';
import type { UsuarioAutenticado } from '../../compartido/infraestructura/auth/usuario-autenticado.js';
import { ResumirStockCasoUso } from '../aplicacion/casos-uso/resumir-stock.caso-uso.js';
import { ResumirStockDto } from './dto/resumir-stock.dto.js';
import { ResumenStockRespuesta } from './dto/resumen-stock.respuesta.js';

/** Resumen del stock para el tablero (009): `admin`, `gerente` y `residente` (solo sus obras). */
@Controller('stock/resumen')
export class StockResumenController {
  constructor(private readonly resumirStock: ResumirStockCasoUso) {}

  @Get()
  @Roles('admin', 'residente', 'gerente')
  async resumir(
    @Query() consulta: ResumirStockDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ResumenStockRespuesta[]> {
    const resumen = await this.resumirStock.ejecutar(consulta.obraIds, usuario);
    return resumen.map(ResumenStockRespuesta.desde);
  }
}
