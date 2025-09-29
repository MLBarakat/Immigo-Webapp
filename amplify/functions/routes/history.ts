import { Router, Request, Response } from 'express';
import { authenticate } from '../authMiddleware';
import { supabase, logger } from '../clients';

const router = Router();

router.get('/history', authenticate, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, timestamp:created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('Error fetching history:', { error });
    return res.status(500).json({ error: 'Failed to fetch conversation history.' });
  }
  res.json({ history: data });
});

export default router;