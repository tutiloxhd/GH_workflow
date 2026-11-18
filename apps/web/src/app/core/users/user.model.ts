// Contrato de usuario de la API (apps/api/openapi.yaml, esquema User).
export const ROLE_CODES = ['ADMIN', 'MANAGER', 'BIDDER', 'LEGAL_REVIEWER'] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export interface User {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly rut: string | null;
  readonly adminNewAreaId: number | null;
  readonly adminNewAreaName: string | null;
  readonly status: UserStatus;
  readonly roles: readonly RoleCode[];
  readonly createdAt: string;
}

export interface UserEnvelope {
  readonly user: User;
}

// Textos visibles centralizados; los nombres coinciden con el catálogo de roles de la base.
export const ROLE_LABELS: Readonly<Record<RoleCode, string>> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor de remates',
  BIDDER: 'Responsable de participación',
  LEGAL_REVIEWER: 'Responsable de revisión legal',
};

export const STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  BLOCKED: 'Bloqueado',
};
