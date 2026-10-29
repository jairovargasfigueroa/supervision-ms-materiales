import { ZONA_NEGOCIO } from '../compartido/dominio/periodo.js';

/**
 * Fechas de la semilla relativas a la fecha de carga D (`docs/datos-prueba.md`, sección 1, y
 * 011, diseño, «Resolvedor de fechas»). Notación:
 *
 * - `D`, `D-120`, `D+18`: fecha (`AAAA-MM-DD`), n días antes o después de D.
 * - `D-2 11:00`: ese día a esa hora de La Paz (instante).
 * - `M0`, `M-3`, `M+1`: periodo (`AAAA-MM`), k meses antes o después del mes de D.
 * - `M-1/09 10:00`: día 9 del mes `M-1` a las 10:00 de La Paz (instante); sin hora, a las 10:00.
 *
 * Los días de un mes van de 2 a 27 (existen en cualquier mes y no cruzan de periodo). Una
 * expresión mal formada o con un día fuera de ese rango es un error: no se adivina.
 */
export type FechaResuelta =
  | { tipo: 'fecha'; valor: string }
  | { tipo: 'periodo'; valor: string }
  | { tipo: 'instante'; valor: Date };

/** Expresión de fecha relativa mal escrita o con valores fuera de rango. */
export class FechaRelativaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'FechaRelativaError';
  }
}

/** Hora del día que se usa en `M-k/dd` cuando no se indica otra (sección 1). */
const HORA_POR_DEFECTO = { hora: 10, minuto: 0 };
const DIA_MINIMO = 2;
const DIA_MAXIMO = 27;

const FORMATO_D = /^\d{4}-\d{2}-\d{2}$/;
const EXPRESION_DIA = /^D(?:([+-])(\d{1,4}))?(?: (\d{2}):(\d{2}))?$/;
const EXPRESION_MES =
  /^M(?:0|([+-])([1-9]\d{0,2}))(?:\/(\d{2})(?: (\d{2}):(\d{2}))?)?$/;

const partesLaPaz = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_NEGOCIO,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * Fecha de carga D (`AAAA-MM-DD`): la de `SEMILLA_FECHA` si viene (la calcula el script de
 * infra una sola vez para los tres servicios) o la de hoy en `America/La_Paz`.
 */
export function fechaDeCarga(
  semillaFecha: string | undefined,
  ahora: Date = new Date(),
): string {
  const valor = semillaFecha?.trim();
  if (valor) {
    validarD(valor);
    return valor;
  }
  const p = partes(ahora);
  return formatearFecha(p.anio, p.mes, p.dia);
}

/** Resuelve una expresión relativa a D (`AAAA-MM-DD`). */
export function resolver(expresion: string, d: string): FechaResuelta {
  const [anioD, mesD, diaD] = validarD(d);

  const dia = EXPRESION_DIA.exec(expresion);
  if (dia) {
    const [, signo, cantidad, hh, mm] = dia;
    const n = cantidad ? Number(cantidad) * (signo === '-' ? -1 : 1) : 0;
    const fecha = new Date(Date.UTC(anioD, mesD - 1, diaD + n));
    const anio = fecha.getUTCFullYear();
    const mes = fecha.getUTCMonth() + 1;
    const diaMes = fecha.getUTCDate();
    if (hh === undefined) {
      return { tipo: 'fecha', valor: formatearFecha(anio, mes, diaMes) };
    }
    const hora = validarHora(expresion, hh, mm);
    return {
      tipo: 'instante',
      valor: instanteEnLaPaz(anio, mes, diaMes, hora.hora, hora.minuto),
    };
  }

  const mes = EXPRESION_MES.exec(expresion);
  if (mes) {
    const [, signo, cantidad, dd, hh, mm] = mes;
    const k = cantidad ? Number(cantidad) * (signo === '-' ? -1 : 1) : 0;
    const total = anioD * 12 + (mesD - 1) + k;
    const anio = Math.floor(total / 12);
    const mesK = (total % 12) + 1;
    if (dd === undefined) {
      return { tipo: 'periodo', valor: formatearPeriodo(anio, mesK) };
    }
    const diaMes = Number(dd);
    if (diaMes < DIA_MINIMO || diaMes > DIA_MAXIMO) {
      throw new FechaRelativaError(
        `«${expresion}»: el día del mes debe estar entre ${DIA_MINIMO} y ${DIA_MAXIMO}`,
      );
    }
    const hora =
      hh === undefined ? HORA_POR_DEFECTO : validarHora(expresion, hh, mm);
    return {
      tipo: 'instante',
      valor: instanteEnLaPaz(anio, mesK, diaMes, hora.hora, hora.minuto),
    };
  }

  throw new FechaRelativaError(
    `«${expresion}» no es una fecha relativa válida (D±n, D±n hh:mm, M0, M±k o M±k/dd hh:mm)`,
  );
}

/** Resuelve una expresión que tiene que ser un instante (`D-2 11:00`, `M-1/09 10:00`). */
export function resolverInstante(expresion: string, d: string): Date {
  const resultado = resolver(expresion, d);
  if (resultado.tipo !== 'instante') {
    throw new FechaRelativaError(
      `«${expresion}» tiene que ser un instante (D±n hh:mm o M±k/dd hh:mm)`,
    );
  }
  return resultado.valor;
}

/** Resuelve una expresión que tiene que ser un periodo (`M0`, `M-3`). */
export function resolverPeriodo(expresion: string, d: string): string {
  const resultado = resolver(expresion, d);
  if (resultado.tipo !== 'periodo') {
    throw new FechaRelativaError(
      `«${expresion}» tiene que ser un periodo (M0 o M±k)`,
    );
  }
  return resultado.valor;
}

/** El instante de la fecha y hora dadas en `America/La_Paz`. */
export function instanteEnLaPaz(
  anio: number,
  mes: number,
  dia: number,
  hora = 0,
  minuto = 0,
): Date {
  const supuesto = Date.UTC(anio, mes - 1, dia, hora, minuto);
  // Desfase de la zona en ese momento (La Paz: UTC−4 todo el año).
  const p = partes(new Date(supuesto));
  const comoUtc = Date.UTC(
    p.anio,
    p.mes - 1,
    p.dia,
    p.hora,
    p.minuto,
    p.segundo,
  );
  return new Date(supuesto - (comoUtc - supuesto));
}

function validarD(d: string): [number, number, number] {
  if (!FORMATO_D.test(d)) {
    throw new FechaRelativaError(
      `La fecha de carga «${d}» debe tener el formato AAAA-MM-DD`,
    );
  }
  const [anio, mes, dia] = d.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    throw new FechaRelativaError(`La fecha de carga «${d}» no existe`);
  }
  return [anio, mes, dia];
}

function validarHora(expresion: string, hh: string, mm: string) {
  const hora = Number(hh);
  const minuto = Number(mm);
  if (hora > 23 || minuto > 59) {
    throw new FechaRelativaError(`«${expresion}»: la hora no es válida`);
  }
  return { hora, minuto };
}

function partes(instante: Date) {
  const valores = partesLaPaz.formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(valores.find((p) => p.type === tipo)?.value);
  return {
    anio: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    hora: valor('hour'),
    minuto: valor('minute'),
    segundo: valor('second'),
  };
}

function formatearFecha(anio: number, mes: number, dia: number): string {
  return `${formatearPeriodo(anio, mes)}-${String(dia).padStart(2, '0')}`;
}

function formatearPeriodo(anio: number, mes: number): string {
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}`;
}
