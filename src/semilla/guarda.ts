/**
 * Guarda de la semilla y del vaciado (`docs/datos-prueba.md`, sección 12, «Guardas»): se niegan a
 * correr en producción o contra una base que no sea local.
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

export interface EntornoSemilla {
  nodeEnv: string | undefined;
  mongoUri: string | undefined;
}

/** Lanza `GuardaSemillaError` si el entorno no permite cargar ni vaciar datos de prueba. */
export function verificarGuarda({ nodeEnv, mongoUri }: EntornoSemilla): void {
  if (nodeEnv?.trim().toLowerCase() === 'production') {
    throw new GuardaSemillaError(
      'La semilla no corre con NODE_ENV=production: los datos de prueba solo se cargan en desarrollo.',
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
