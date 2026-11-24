import { z } from 'zod';
import { logger } from '../../../platform/logging/logger.js';
import { DAY_KEY_PATTERN, type SourceHoliday } from '../domain/holiday.js';
import type { HolidayProvider } from './holiday-provider.js';

const BOOSTR_BASE_URL = 'https://api.boostr.cl';
const REQUEST_TIMEOUT_MS = 10_000;
// Boostr incluye una fila informativa para los domingos; ya son inhábiles y no es un feriado.
const SUNDAYS_ENTRY = /domingos/i;

const responseSchema = z.object({
  status: z.literal('success'),
  data: z.array(
    z.object({
      date: z.string().regex(DAY_KEY_PATTERN),
      title: z.string().trim().min(1),
      inalienable: z.boolean().optional(),
    }),
  ),
});

// Feriados de Chile desde Boostr (GET /holidays/{year}.json). Es una API gratuita y sin clave;
// su único límite publicado es de 5 consultas cada 10 segundos.
export function createBoostrHolidayProvider(): HolidayProvider {
  return {
    async fetchYear(year) {
      try {
        const response = await fetch(`${BOOSTR_BASE_URL}/holidays/${String(year)}.json`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
          logger.info('holidays.source_failed', { year, status: response.status });
          return null;
        }
        const parsed = responseSchema.safeParse(await response.json());
        if (!parsed.success) {
          logger.info('holidays.source_invalid_response', { year });
          return null;
        }
        return parsed.data.data
          .filter((entry) => entry.date.startsWith(String(year)))
          .filter((entry) => !SUNDAYS_ENTRY.test(entry.title))
          .map((entry): SourceHoliday => ({
            date: entry.date,
            name: entry.title,
            isInalienable: entry.inalienable ?? false,
          }));
      } catch (error) {
        logger.error('holidays.source_unreachable', error, { year });
        return null;
      }
    },
  };
}
