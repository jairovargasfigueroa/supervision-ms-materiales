import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CargarSemilla, COLECCIONES_SEMILLA } from './cargar-semilla.js';
import { fechaDeCarga } from './fecha-relativa.js';
import { SemillaModule } from './semilla.module.js';

/**
 * Datos de prueba de Materiales (011). `npm run semilla` carga (`cargar`). Lee `MONGODB_URI` y
 * `NODE_ENV` del `.env` o del entorno, y la fecha de carga D de `SEMILLA_FECHA` (por defecto, hoy
 * en La Paz). Termina con código 0 si todo salió bien y 1 si no.
 */
const registro = new ConsoleLogger('Semilla');

async function principal(modo: string): Promise<void> {
  if (modo !== 'cargar') {
    registro.error(`Modo desconocido «${modo}» (se espera cargar).`);
    process.exitCode = 2;
    return;
  }
  const contexto = await NestFactory.createApplicationContext(
    SemillaModule.registrar(),
    { logger: ['error', 'warn'], abortOnError: false },
  );
  try {
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
