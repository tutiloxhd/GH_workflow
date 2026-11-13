import bcrypt from 'bcrypt';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  matches(password: string, passwordHash: string): Promise<boolean>;
}

export const PRODUCTION_BCRYPT_COST = 12;

export function createBcryptPasswordHasher(cost: number): PasswordHasher {
  return {
    hash: (password) => bcrypt.hash(password, cost),
    matches: (password, passwordHash) => bcrypt.compare(password, passwordHash),
  };
}
