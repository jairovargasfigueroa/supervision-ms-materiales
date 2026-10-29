/** Roles de las personas que trabajan en la constructora (ERP y app de obra). */
export const ROLES_INTERNOS: readonly string[] = [
  'admin',
  'residente',
  'gerente',
  'maestro',
  'almacenero',
];

/** Clientes desde los que inicia sesión una persona de la constructora. */
const CLIENTES_INTERNOS: readonly string[] = ['erp', 'app-obra'];

/**
 * Roles que cuentan según la aplicación desde la que se inició sesión (`azp` del token)
 * (convenciones, «Usuario con varios roles»):
 * - `portal`: solo `cliente`;
 * - `erp` o `app-obra`: solo los roles internos;
 * - otro cliente (de servicio: `gateway`, `ia-agentes`, `n8n`): los roles del token tal cual.
 */
export function rolesEfectivos(
  roles: readonly string[],
  azp: string | undefined,
): string[] {
  if (azp === 'portal') return roles.filter((rol) => rol === 'cliente');
  if (azp !== undefined && CLIENTES_INTERNOS.includes(azp)) {
    return roles.filter((rol) => ROLES_INTERNOS.includes(rol));
  }
  return [...roles];
}
