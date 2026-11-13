// Fuente única de los roles del sistema; el esquema de base y la API se derivan de aquí.
export const ROLE_CODES = ['ADMIN', 'MANAGER', 'BIDDER', 'LEGAL_REVIEWER'] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const ADMIN_ROLE: RoleCode = 'ADMIN';
