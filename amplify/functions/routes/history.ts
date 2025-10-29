import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../authMiddleware';
import { supabase, logger } from '../clients';
import { AppError } from '../errors';

const router = Router();

router.get('/history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  logger.debug('GET /history request received', { userId: req.user?.id });
  try {
    if (!req.user) {
      throw new AppError('User not authenticated.', 401);
    }

    const { data, error } = await supabase
      .from('messages')
      .select('id, role, content, timestamp:created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (error) {
      throw new AppError('Failed to fetch conversation history from database.', 500, true, { dbError: error });
    }

    logger.info('Successfully fetched conversation history.', { userId: req.user.id, messageCount: data?.length });
    res.json({ history: data });

  } catch (error) {
    next(error);
  }
});

export default router;
