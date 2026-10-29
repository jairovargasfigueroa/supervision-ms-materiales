import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Roles } from '../../compartido/infraestructura/auth/roles.decorator.js';
import { ROLES_INTERNOS } from '../../compartido/infraestructura/auth/roles-efectivos.js';
import type { Pagina } from '../../compartido/dominio/paginacion.js';
import { ActualizarMaterialCasoUso } from '../aplicacion/casos-uso/actualizar-material.caso-uso.js';
import { CrearMaterialCasoUso } from '../aplicacion/casos-uso/crear-material.caso-uso.js';
import { ListarMaterialesCasoUso } from '../aplicacion/casos-uso/listar-materiales.caso-uso.js';
import { ActualizarMaterialDto } from './dto/actualizar-material.dto.js';
import { CrearMaterialDto } from './dto/crear-material.dto.js';
import { ListarMaterialesDto } from './dto/listar-materiales.dto.js';
import { MaterialRespuesta } from './dto/material.respuesta.js';

/** Catálogo de materiales (003). Lectura: todos los internos; escritura: solo `admin`. */
@Controller('materiales')
export class MaterialesController {
  constructor(
    private readonly listarMateriales: ListarMaterialesCasoUso,
    private readonly crearMaterial: CrearMaterialCasoUso,
    private readonly actualizarMaterial: ActualizarMaterialCasoUso,
  ) {}

  @Get()
  @Roles(...ROLES_INTERNOS)
  async listar(
    @Query() consulta: ListarMaterialesDto,
  ): Promise<Pagina<MaterialRespuesta>> {
    const { busqueda, soloActivos, pagina, tamano, orden, direccion } =
      consulta;
    return MaterialRespuesta.pagina(
      await this.listarMateriales.ejecutar(
        { busqueda, soloActivos },
        { pagina, tamano, orden, direccion },
      ),
    );
  }

  @Post()
  @Roles('admin')
  async crear(@Body() dto: CrearMaterialDto): Promise<MaterialRespuesta> {
    return MaterialRespuesta.desde(await this.crearMaterial.ejecutar(dto));
  }

  @Put(':id')
  @Roles('admin')
  async actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarMaterialDto,
  ): Promise<MaterialRespuesta> {
    return MaterialRespuesta.desde(
      await this.actualizarMaterial.ejecutar(id, {
        ...dto,
        atributos: dto.atributos ?? [],
      }),
    );
  }
}
