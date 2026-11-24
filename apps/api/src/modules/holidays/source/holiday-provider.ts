import type { SourceHoliday } from '../domain/holiday.js';

// Fuente externa de feriados de un año. Devuelve null si no está disponible.
export interface HolidayProvider {
  fetchYear(year: number): Promise<SourceHoliday[] | null>;
}
