import { Module } from '@nestjs/common';
import { SaludController } from './presentacion/salud.controller.js';

@Module({ controllers: [SaludController] })
export class SaludModule {}
