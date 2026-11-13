const DUPLICATE_ENTRY_ERROR_CODE = 'ER_DUP_ENTRY';

// Drizzle envuelve el error del driver en `cause`; se revisan ambos niveles.
export function isDuplicateEntryError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 2 && typeof current === 'object' && current !== null; depth++) {
    if ('code' in current && current.code === DUPLICATE_ENTRY_ERROR_CODE) return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}
