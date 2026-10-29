import { ConsoleLogger, type INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CargarSemilla, COLECCIONES_SEMILLA } from './cargar-semilla.js';
import { fechaDeCarga } from './fecha-relativa.js';
import { SemillaModule } from './semilla.module.js';
import { COLECCIONES_NEGOCIO, VaciarSemilla } from './vaciar.js';

/**
 * Datos de prueba de Materiales (011):
 *
 * - `node dist/semilla/main.js cargar` (`npm run semilla`): carga sin pisar lo que existe;
 * - `node dist/semilla/main.js vaciar` (`npm run semilla:vaciar`): vacía las colecciones del negocio.
 *
 * Lee `MONGODB_URI` y `NODE_ENV` del `.env` o del entorno, y la fecha de carga D de
 * `SEMILLA_FECHA` (por defecto, hoy en La Paz). Termina con código 0 si todo salió bien, 1 si
 * falló (guarda, datos que no cuadran, MongoDB) y 2 si el modo no existe.
 */
const registro = new ConsoleLogger('Semilla');

const MODOS: Record<
  string,
  (contexto: INestApplicationContext) => Promise<void>
> = {
  cargar: cargar,
  vaciar: vaciar,
};

async function cargar(contexto: INestApplicationContext): Promise<void> {
  const d = fechaDeCarga(
    contexto.get(ConfigService).get<string>('SEMILLA_FECHA'),
  );
  const resumen = await contexto.get(CargarSemilla).ejecutar(d);
  registro.log(`Materiales cargado con D = ${resumen.fecha}`);
  for (const coleccion of COLECCIONES_SEMILLA) {
    registro.log(
      `  ${coleccion}: ${resumen.totales[coleccion]} (${resumen.insertados[coleccion]} nuevos)`,
    );
  }
  registro.log(`  outbox_evento: ${resumen.totales.outbox_evento}`);
  // Línea para los scripts de infra.
  console.log(
    `RESUMEN_SEMILLA ${JSON.stringify({ servicio: 'materiales', ...resumen })}`,
  );
}

async function vaciar(contexto: INestApplicationContext): Promise<void> {
  const borrados = await contexto.get(VaciarSemilla).ejecutar();
  registro.log('Materiales vaciado');
  for (const coleccion of COLECCIONES_NEGOCIO) {
    registro.log(`  ${coleccion}: ${borrados[coleccion]} borrados`);
  }
  console.log(
    `RESUMEN_VACIADO ${JSON.stringify({ servicio: 'materiales', borrados })}`,
  );
}

async function principal(modo: string): Promise<void> {
  const ejecutar = MODOS[modo];
  if (!ejecutar) {
    registro.error(
      `Modo desconocido «${modo}» (se espera ${Object.keys(MODOS).join(' o ')}).`,
    );
    process.exitCode = 2;
    return;
  }
  const contexto = await NestFactory.createApplicationContext(
    SemillaModule.registrar(),
    { logger: ['error', 'warn'], abortOnError: false },
  );
  try {
    await ejecutar(contexto);
  } finally {
    await contexto.close();
  }
}

try {
  await principal(process.argv[2] ?? 'cargar');
} catch (error) {
  registro.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
