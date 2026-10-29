import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Pagina } from '../../compartido/dominio/paginacion.js';
import { Roles } from '../../compartido/infraestructura/auth/roles.decorator.js';
import { ROLES_INTERNOS } from '../../compartido/infraestructura/auth/roles-efectivos.js';
import { UsuarioActual } from '../../compartido/infraestructura/auth/usuario-actual.decorator.js';
import type { UsuarioAutenticado } from '../../compartido/infraestructura/auth/usuario-autenticado.js';
import type { Solicitud } from '../../compartido/infraestructura/http/solicitud.js';
import { ConsultarConsumosCasoUso } from '../aplicacion/casos-uso/consultar-consumos.caso-uso.js';
import { ListarMovimientosCasoUso } from '../aplicacion/casos-uso/listar-movimientos.caso-uso.js';
import { RegistrarMovimientoCasoUso } from '../aplicacion/casos-uso/registrar-movimiento.caso-uso.js';
import { ConsultarConsumosDto } from './dto/consultar-consumos.dto.js';
import { ConsumoRespuesta } from './dto/consumo.respuesta.js';
import { ListarMovimientosDto } from './dto/listar-movimientos.dto.js';
import { MovimientoRegistradoRespuesta } from './dto/movimiento-registrado.respuesta.js';
import { MovimientoRespuesta } from './dto/movimiento.respuesta.js';
import { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto.js';

/**
 * Ingresos y salidas de material (004). Registrar: solo el `almacenero` asignado a la obra;
 * consultar: internos que ven la obra (`obra_acceso`). Consumos del periodo (006): `admin`,
 * `gerente` y `residente` que ven la obra.
 */
@Controller()
export class MovimientosController {
  constructor(
    private readonly registrarMovimiento: RegistrarMovimientoCasoUso,
    private readonly listarMovimientos: ListarMovimientosCasoUso,
    private readonly consultarConsumos: ConsultarConsumosCasoUso,
  ) {}

  /** Paginado, por defecto `registradoEn desc`; `periodo` opcional (`AAAA-MM`). */
  @Get('obras/:obraId/movimientos')
  @Roles(...ROLES_INTERNOS)
  async listar(
    @Param('obraId') obraId: string,
    @Query() consulta: ListarMovimientosDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<Pagina<MovimientoRespuesta>> {
    const { periodo, pagina, tamano, orden, direccion } = consulta;
    return MovimientoRespuesta.pagina(
      await this.listarMovimientos.ejecutar(
        obraId,
        { periodo },
        { pagina, tamano, orden, direccion },
        usuario,
      ),
    );
  }

  /** Suma de las salidas del periodo por partida y material (006). */
  @Get('obras/:obraId/consumos')
  @Roles('admin', 'gerente', 'residente')
  async consumos(
    @Param('obraId') obraId: string,
    @Query() consulta: ConsultarConsumosDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ConsumoRespuesta[]> {
    const consumos = await this.consultarConsumos.ejecutar(
      obraId,
      consulta.periodo,
      usuario,
    );
    return consumos.map((consumo) => ConsumoRespuesta.desde(consumo));
  }

  /** `201` si se registró ahora; `200` con el existente si el `id` ya estaba (envío repetido). */
  @Post('movimientos')
  @Roles('almacenero')
  async registrar(
    @Body() dto: RegistrarMovimientoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() solicitud: Solicitud,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<MovimientoRegistradoRespuesta> {
    const resultado = await this.registrarMovimiento.ejecutar(
      {
        id: dto.id,
        obraId: dto.obraId,
        materialId: dto.materialId,
        tipo: dto.tipo,
        cantidad: dto.cantidad,
        partidaId: dto.partidaId ?? null,
        numeroNotaRemision: dto.notaRemision?.numero.trim() ?? null,
        registradoEn: new Date(dto.registradoEn),
      },
      usuario,
      // El `X-Request-Id` es el correlacionId de StockBajo y MovimientoRegistrado (si es un UUID).
      solicitud.requestId,
    );
    respuesta.status(resultado.creado ? HttpStatus.CREATED : HttpStatus.OK);
    return MovimientoRegistradoRespuesta.desde(resultado);
  }
}
