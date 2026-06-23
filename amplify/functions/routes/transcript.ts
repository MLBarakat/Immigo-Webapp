import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../authMiddleware';
import { logger } from '../clients';
import { AppError } from '../errors';

const router = Router();

router.post('/transcript', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated.', 401);
    }

    const { transcript } = req.body;
    if (!transcript) {
      throw new AppError('Transcript content is required.', 400);
    }

    logger.info('Transcript received successfully', { userId: req.user.id, transcriptLength: transcript.length });

    res.status(200).json({ 
      message: 'Transcript received.', 
      transcript 
    });
  } catch (error) {
    next(error);
  }
});

export default router;
