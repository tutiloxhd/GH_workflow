// Lee una cookie del encabezado Cookie. Basta para la única cookie de la API (la de sesión),
// sin agregar una dependencia de parsing.
export function readCookie(
  cookieHeader: string | undefined,
  cookieName: string,
): string | undefined {
  if (!cookieHeader) return undefined;

  for (const pair of cookieHeader.split(';')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) continue;
    if (pair.slice(0, separatorIndex).trim() !== cookieName) continue;

    const rawValue = pair.slice(separatorIndex + 1).trim();
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
