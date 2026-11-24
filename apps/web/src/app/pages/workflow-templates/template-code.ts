// Convierte un texto libre al formato de código de la API: MAYÚSCULAS_CON_GUION_BAJO, empezando
// con una letra. Conserva el guion bajo final para no estorbar mientras se escribe.
export function toCode(value: string, maxLength = 50): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^[^A-Z]+/, '')
    .slice(0, maxLength);
}
