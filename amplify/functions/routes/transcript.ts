// amplify/functions/routes/transcript.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../authMiddleware';
import { logger } from '../clients';
import { AppError } from '../errors';

const router = Router();

router.post('/transcript', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  logger.debug('POST /transcript request received', { userId: req.user?.id });
  try {
    if (!req.user) {
      throw new AppError('User not authenticated.', 401);
    }
    const { transcript } = req.body;
    if (!transcript) {
      throw new AppError('Transcript content is required.', 400);
    }

    // TODO: Add logic to process transcript and get AI response
    // TODO: Add Polly integration to convert AI response to speech

    logger.info('Transcript received successfully', { userId: req.user.id });
    // For now, just echo the transcript back in the response.
    res.status(201).json({ message: 'Transcript received.', transcript });

  } catch (error) {
    next(error);
  }
});

export default router;
