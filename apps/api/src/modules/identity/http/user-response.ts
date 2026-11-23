import type { UserAccount } from '../persistence/users-repository.js';

// Contrato público de un usuario: nunca incluye el hash de la contraseña ni datos de sesión.
export const toUserResponse = (user: UserAccount) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  rut: user.rut,
  regionId: user.regionId,
  regionName: user.regionName,
  status: user.status,
  roles: user.roles,
  createdAt: user.createdAt.toISOString(),
});
