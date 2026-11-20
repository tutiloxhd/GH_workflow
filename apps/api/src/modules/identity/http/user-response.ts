import type { UserAccount } from '../persistence/users-repository.js';

// Contrato público de un usuario: nunca incluye el hash de la contraseña ni datos de sesión.
export const toUserResponse = (user: UserAccount) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  rut: user.rut,
  adminNewAreaId: user.adminNewAreaId,
  adminNewAreaName: user.adminNewAreaName,
  adminNewRegion: user.adminNewRegion,
  status: user.status,
  roles: user.roles,
  createdAt: user.createdAt.toISOString(),
});
