import { Router, type Request, type Response, type NextFunction } from 'express';
import { celebrate, Joi, Segments } from 'celebrate';
import { logRequest } from '../services/requestLogger.js';
import { solveService } from '../services/solveService.js';
import type { SolveRequestBody } from '../types.js';

export const solveRouter = Router();

// Set to true to only log incoming requests without running the agent.
// Useful for collecting sample data from the competition platform.
const LOG_ONLY = true;

const solveSchema = Joi.object({
  prompt: Joi.string().required(),
  files: Joi.array()
    .items(
      Joi.object({
        filename: Joi.string().required(),
        content: Joi.string().required(),
        mime_type: Joi.string().required(),
      })
    )
    .optional(),
  tripletex_credentials: Joi.object({
    proxy_url: Joi.string().uri().required(),
    session_token: Joi.string().required(),
  }).required(),
});

// Log-only route — no validation, just store and return completed
solveRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  if (!LOG_ONLY) return next();

  try {
    await logRequest(req.body);
    console.log('[MODE] log-only — skipping agent');
    res.json({ status: 'completed' });
  } catch (err) {
    next(err);
  }
});

// Agent route — with validation, runs the full agent
solveRouter.post(
  '/',
  celebrate({ [Segments.BODY]: solveSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await logRequest(req.body);
      console.log('[MODE] agent — running solve');
      await solveService.solve(req.body as SolveRequestBody);
      res.json({ status: 'completed' });
    } catch (err) {
      next(err);
    }
  }
);
