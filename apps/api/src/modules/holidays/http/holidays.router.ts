import { Router, type Response } from 'express';
import { z, type ZodType } from 'zod';
import {
  sendProblem,
  sendValidationProblem,
  type Problem,
} from '../../../platform/http/problem-details.js';
import type { IdentityDependencies } from '../../identity/application/identity-dependencies.js';
import { getCurrentUser, requireRole, requireSession } from '../../identity/http/authorization.js';
import type { Actor } from '../../workflow/domain/task-rules.js';
import {
  addHoliday,
  listHolidays,
  removeHoliday,
  syncHolidays,
  type HolidayDependencies,
  type HolidayFailure,
} from '../application/holiday-administration.js';
import {
  DAY_KEY_PATTERN,
  MAX_HOLIDAY_NAME_LENGTH,
  MAX_HOLIDAY_YEAR,
  MIN_HOLIDAY_YEAR,
} from '../domain/holiday.js';

const HOLIDAY_PROBLEMS: Readonly<Record<HolidayFailure, Problem>> = {
  FORBIDDEN: { status: 403, code: 'FORBIDDEN', title: 'No tienes permiso para esta acción' },
  HOLIDAY_SOURCE_NOT_CONFIGURED: {
    status: 409,
    code: 'HOLIDAY_SOURCE_NOT_CONFIGURED',
    title: 'La sincronización de feriados no está configurada',
  },
  HOLIDAY_SOURCE_UNAVAILABLE: {
    status: 502,
    code: 'HOLIDAY_SOURCE_UNAVAILABLE',
    title: 'No se pudieron obtener los feriados desde la fuente externa',
  },
  HOLIDAY_EXISTS: { status: 409, code: 'HOLIDAY_EXISTS', title: 'Ese día ya es feriado' },
  HOLIDAY_NOT_FOUND: { status: 404, code: 'HOLIDAY_NOT_FOUND', title: 'El feriado no existe' },
};

const year = z.coerce.number().int().min(MIN_HOLIDAY_YEAR).max(MAX_HOLIDAY_YEAR);
// Valida además que el día exista en el calendario (rechaza 2026-02-30).
const dayKey = z
  .string()
  .regex(DAY_KEY_PATTERN)
  .refine((value) => new Date(`${value}T00:00:00Z`).toISOString().startsWith(value));

const yearQuery = z.strictObject({ year });
const syncBody = z.strictObject({ year });
const holidayBody = z.strictObject({
  date: dayKey,
  name: z.string().trim().min(1).max(MAX_HOLIDAY_NAME_LENGTH),
  isInalienable: z.boolean().default(false),
});
const dateParams = z.strictObject({ date: dayKey });

function parse<Schema extends ZodType>(
  schema: Schema,
  value: unknown,
  response: Response,
): z.output<Schema> | undefined {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  sendValidationProblem(response, parsed.error);
  return undefined;
}

const actorOf = (response: Response): Actor => {
  const user = getCurrentUser(response);
  return { id: user.id, roles: user.roles };
};

// Feriados usados para contar plazos en días hábiles. Cualquier sesión los consulta; solo el
// administrador los sincroniza o cambia.
export function createHolidaysRouter(
  dependencies: HolidayDependencies,
  identity: IdentityDependencies,
): Router {
  const router = Router();
  router.use(requireSession(identity));

  router.get('/', async (request, response) => {
    const query = parse(yearQuery, request.query, response);
    if (!query) return;
    response.json(await listHolidays(dependencies, query.year));
  });

  router.post('/sync', requireRole('ADMIN'), async (request, response) => {
    const body = parse(syncBody, request.body, response);
    if (!body) return;
    const outcome = await syncHolidays(dependencies, actorOf(response), body.year);
    if (!outcome.isSuccess) {
      sendProblem(response, HOLIDAY_PROBLEMS[outcome.failure]);
      return;
    }
    response.json(await listHolidays(dependencies, body.year));
  });

  router.post('/', requireRole('ADMIN'), async (request, response) => {
    const body = parse(holidayBody, request.body, response);
    if (!body) return;
    const outcome = await addHoliday(dependencies, actorOf(response), body);
    if (!outcome.isSuccess) {
      sendProblem(response, HOLIDAY_PROBLEMS[outcome.failure]);
      return;
    }
    response.status(201).json(await listHolidays(dependencies, Number(body.date.slice(0, 4))));
  });

  router.delete('/:date', requireRole('ADMIN'), async (request, response) => {
    const params = parse(dateParams, request.params, response);
    if (!params) return;
    const outcome = await removeHoliday(dependencies, actorOf(response), params.date);
    if (!outcome.isSuccess) {
      sendProblem(response, HOLIDAY_PROBLEMS[outcome.failure]);
      return;
    }
    response.status(204).end();
  });

  return router;
}
