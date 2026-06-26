// amplify/functions/routes/config.ts

import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { AppError } from '../errors';

const router = Router();

router.get('/config', async (req: Request, res: Response, next: NextFunction) => {
  logger.debug('GET /config request received');
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
      throw new AppError('Supabase URL is not set or is invalid in environment variables.', 500, true, { check: 'SUPABASE_URL' });
    }

    if (!supabaseAnonKey) {
      throw new AppError('Supabase anon key is not set in environment variables.', 500, true, { check: 'SUPABASE_ANON_KEY' });
    }

    logger.info('Successfully retrieved Supabase configuration parameters.');

    res.status(200).json({ supabaseUrl, supabaseAnonKey });
  } catch (error) {
    next(error);
  }
});

export default router;