/**
 * Guarda de la semilla y del vaciado (`docs/datos-prueba.md`, sección 12, «Guardas»): se niegan a
 * correr en producción o contra una base que no sea local.
 *
 * Excepción (601, datos de demostración): con `SEMILLA_DEMO=si`, **la carga** corre igual en un
 * entorno de producción o contra una base que no es local (sigue siendo idempotente y no pisa
 * nada). **El vaciado nunca**: fuera de desarrollo se niega siempre, con o sin `SEMILLA_DEMO`.
 */
export class GuardaSemillaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'GuardaSemillaError';
  }
}

/**
 * Hosts permitidos: la máquina local y el nombre del contenedor de MongoDB en el Docker Compose
 * de infra (servicio y `hostname` `mongo`).
 */
export const HOSTS_LOCALES = ['localhost', '127.0.0.1', '::1', 'mongo'];

/** Qué va a hacer el proceso: solo `cargar` admite la excepción de `SEMILLA_DEMO=si`. */
export type ModoSemilla = 'cargar' | 'vaciar';

export interface EntornoSemilla {
  nodeEnv: string | undefined;
  mongoUri: string | undefined;
  /** Valor de `SEMILLA_DEMO`; solo `si` habilita la excepción. */
  semillaDemo?: string;
  /** Sin modo, la guarda es la estricta (como para vaciar). */
  modo?: ModoSemilla;
}

/** `SEMILLA_DEMO=si` (sin distinguir mayúsculas ni espacios a los costados). */
export function esSemillaDemo(valor: string | undefined): boolean {
  return valor?.trim().toLowerCase() === 'si';
}

/**
 * Lanza `GuardaSemillaError` si el entorno no permite cargar ni vaciar datos de prueba. Devuelve
 * `true` si se permitió la carga por la excepción de demostración (`SEMILLA_DEMO=si`).
 */
export function verificarGuarda({
  nodeEnv,
  mongoUri,
  semillaDemo,
  modo,
}: EntornoSemilla): boolean {
  if (modo === 'cargar' && esSemillaDemo(semillaDemo)) {
    if (!mongoUri?.trim()) {
      throw new GuardaSemillaError('Falta MONGODB_URI.');
    }
    if (!/^mongodb(?:\+srv)?:\/\//i.test(mongoUri.trim())) {
      throw new GuardaSemillaError(
        'MONGODB_URI no es una URL de MongoDB (mongodb://… o mongodb+srv://…).',
      );
    }
    return true;
  }
  if (nodeEnv?.trim().toLowerCase() === 'production') {
    throw new GuardaSemillaError(
      'La semilla no corre con NODE_ENV=production: los datos de prueba solo se cargan en desarrollo (o, solo para cargar, con SEMILLA_DEMO=si).',
    );
  }
  if (!mongoUri?.trim()) {
    throw new GuardaSemillaError('Falta MONGODB_URI.');
  }
  const hosts = hostsDeUri(mongoUri.trim());
  const ajenos = hosts.filter((host) => !HOSTS_LOCALES.includes(host));
  if (ajenos.length > 0) {
    throw new GuardaSemillaError(
      `La semilla solo corre contra una base local (${HOSTS_LOCALES.join(', ')}); MONGODB_URI apunta a ${ajenos.join(', ')}.`,
    );
  }
  return false;
}

/** Hosts (sin puerto, en minúsculas) de una URL `mongodb://`; `mongodb+srv://` nunca es local. */
export function hostsDeUri(uri: string): string[] {
  const coincidencia = /^(mongodb(?:\+srv)?):\/\/([^/?#]*)/i.exec(uri);
  if (!coincidencia) {
    throw new GuardaSemillaError(
      'MONGODB_URI no es una URL de MongoDB (mongodb://…).',
    );
  }
  const [, esquema, autoridad] = coincidencia;
  if (esquema.toLowerCase() === 'mongodb+srv') {
    throw new GuardaSemillaError(
      'La semilla no corre con mongodb+srv://: solo contra una base local.',
    );
  }
  const lista = autoridad.slice(autoridad.lastIndexOf('@') + 1);
  const hosts = lista
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host !== '')
    .map((host) =>
      host.startsWith('[')
        ? host.slice(1, host.indexOf(']'))
        : host.split(':')[0],
    )
    .map((host) => host.toLowerCase());
  if (hosts.length === 0) {
    throw new GuardaSemillaError('MONGODB_URI no tiene host.');
  }
  return hosts;
}
