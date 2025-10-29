import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../authMiddleware';
import { supabase, logger } from '../clients';
import { AppError } from '../errors';

const router = Router();

router.get('/settings', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  logger.debug('GET /settings request received', { userId: req.user?.id });
  try {
    if (!req.user) {
      // This check is technically redundant if `authenticate` middleware is effective, but it's good for type safety.
      throw new AppError('User not authenticated.', 401);
    }

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    // 'PGRST116' means no rows were found, which is not an error in this case.
    // We just return an empty object.
    if (error && error.code !== 'PGRST116') {
      throw new AppError('Failed to fetch user settings from database.', 500, true, { dbError: error });
    }

    logger.info('Successfully fetched user settings.', { userId: req.user.id });
    res.json(data || {});

  } catch (error) {
    next(error); // Pass error to the centralized handler
  }
});

router.put('/settings', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  logger.debug('PUT /settings request received', { userId: req.user?.id, body: req.body });
  try {
    if (!req.user) {
      throw new AppError('User not authenticated.', 401);
    }

    // Ensure user_id from the body is not used, only the authenticated user's ID.
    const { user_id: _user_id, ...settingsToUpdate } = req.body;

    const { data, error } = await supabase
      .from('user_settings')
      .upsert({ user_id: req.user.id, ...settingsToUpdate, updated_at: new Date() })
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to update user settings in database.', 500, true, { dbError: error });
    }

    logger.info('Successfully updated user settings.', { userId: req.user.id });
    res.json(data);

  } catch (error) {
    next(error);
  }
});

export default router;
