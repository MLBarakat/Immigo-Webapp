import { Router, Request, Response } from 'express';
import { authenticate } from '../authMiddleware';
import { supabase, logger } from '../clients';

const router = Router();

router.get('/settings', authenticate, async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'User not authenticated.' });
  }
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Error fetching settings:', { error });
    return res.status(500).json({ error: 'Failed to fetch settings.' });
  }
  res.json(data || {});
});

router.put('/settings', authenticate, async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'User not authenticated.' });
  }
  const { user_id: _user_id, ...settingsToUpdate } = req.body;
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: req.user.id, ...settingsToUpdate, updated_at: new Date() })
    .select()
    .single();

  if (error) {
    logger.error('Error updating settings:', { error });
    return res.status(500).json({ error: 'Failed to update settings.' });
  }
  res.json(data);
});

export default router;