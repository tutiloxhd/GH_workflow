import { Router } from 'express';
import { PROBLEMS, sendProblem } from '../../platform/http/problem-details.js';

export function createHealthRouter(checkDatabase: () => Promise<void>): Router {
  const router = Router();

  router.get('/', async (_request, response) => {
    try {
      await checkDatabase();
    } catch {
      // La causa (host, usuario, error del driver) no se expone al cliente.
      sendProblem(response, PROBLEMS.databaseUnavailable);
      return;
    }
    response.json({ status: 'ok', database: 'up' });
  });

  return router;
}
