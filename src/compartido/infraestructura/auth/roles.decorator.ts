import { SetMetadata } from '@nestjs/common';

export const ROLES = 'roles';

/**
 * Roles que pueden usar la ruta (tabla de roles de cada funcionalidad). Si el usuario no tiene
 * ninguno (según `azp`, ver `roles-efectivos.ts`), `RolesGuard` responde `403 SIN_PERMISO`.
 * Una ruta sin `@Roles()` exige solo un token válido.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES, roles);
