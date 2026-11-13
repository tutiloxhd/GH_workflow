import { Router, type Response } from 'express';
import { z } from 'zod';
import { sendProblem, sendValidationProblem } from '../../../platform/http/problem-details.js';
import type { Result } from '../../../platform/result.js';
import type { IdentityDependencies } from '../application/identity-dependencies.js';
import {
  activateUser,
  createUser,
  deactivateUser,
  listUsers,
  replaceUserRoles,
  type UserChangeFailure,
} from '../application/user-administration.js';
import { ADMIN_ROLE, ROLE_CODES } from '../domain/role-code.js';
import type { UserAccount } from '../persistence/users-repository.js';
import { getCurrentUser, requireRole, requireSession } from './authorization.js';
import { IDENTITY_PROBLEMS } from './identity-problems.js';
import { toUserResponse } from './user-response.js';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

const roleCodesSchema = z.array(z.enum(ROLE_CODES)).max(ROLE_CODES.length);

const listQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  role: z.enum(ROLE_CODES).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

const createUserBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(150),
  email: z.email().max(190),
  password: z.string().min(1).max(200),
  roles: roleCodesSchema,
});

const replaceRolesBodySchema = z.strictObject({ roles: roleCodesSchema });

const userIdParamsSchema = z.strictObject({ userId: z.coerce.number().int().positive() });

function respondWithUserChange(
  response: Response,
  outcome: Result<UserAccount, UserChangeFailure>,
): void {
  if (!outcome.isSuccess) {
    sendProblem(response, IDENTITY_PROBLEMS[outcome.failure.code]);
    return;
  }
  response.json({ user: toUserResponse(outcome.value) });
}

export function createUsersRouter(dependencies: IdentityDependencies): Router {
  const router = Router();
  router.use(requireSession(dependencies), requireRole(ADMIN_ROLE));

  router.get('/', async (request, response) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      sendValidationProblem(response, query.error);
      return;
    }
    const page = await listUsers(dependencies, {
      search: query.data.search || undefined,
      role: query.data.role,
      limit: query.data.limit,
      offset: query.data.offset,
    });
    response.json({
      users: page.users.map(toUserResponse),
      total: page.total,
      limit: query.data.limit,
      offset: query.data.offset,
    });
  });

  router.post('/', async (request, response) => {
    const body = createUserBodySchema.safeParse(request.body);
    if (!body.success) {
      sendValidationProblem(response, body.error);
      return;
    }

    const outcome = await createUser(dependencies, getCurrentUser(response).id, body.data);
    if (!outcome.isSuccess) {
      const { failure } = outcome;
      sendProblem(
        response,
        IDENTITY_PROBLEMS[failure.code],
        failure.code === 'PASSWORD_POLICY_VIOLATION' ? { violations: failure.violations } : {},
      );
      return;
    }
    response.status(201).json({ user: toUserResponse(outcome.value) });
  });

  router.put('/:userId/roles', async (request, response) => {
    const params = userIdParamsSchema.safeParse(request.params);
    const body = replaceRolesBodySchema.safeParse(request.body);
    if (!params.success) {
      sendValidationProblem(response, params.error);
      return;
    }
    if (!body.success) {
      sendValidationProblem(response, body.error);
      return;
    }
    respondWithUserChange(
      response,
      await replaceUserRoles(
        dependencies,
        getCurrentUser(response).id,
        params.data.userId,
        body.data.roles,
      ),
    );
  });

  router.post('/:userId/deactivate', async (request, response) => {
    const params = userIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      sendValidationProblem(response, params.error);
      return;
    }
    respondWithUserChange(
      response,
      await deactivateUser(dependencies, getCurrentUser(response).id, params.data.userId),
    );
  });

  router.post('/:userId/activate', async (request, response) => {
    const params = userIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      sendValidationProblem(response, params.error);
      return;
    }
    respondWithUserChange(
      response,
      await activateUser(dependencies, getCurrentUser(response).id, params.data.userId),
    );
  });

  return router;
}
