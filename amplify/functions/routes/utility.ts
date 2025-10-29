import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../authMiddleware';
import { logger } from '../clients';
import { AppError } from '../errors';

const router = Router();

// Placeholder for actual utility logic. The API Gateway is configured for ANY method.
router.all('/utility', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  logger.debug(`${req.method} /utility request received`, { userId: req.user?.id });
  try {
    if (!req.user) {
      throw new AppError('User not authenticated.', 401);
    }

    // TODO: Implement actual utility functionality based on the request method (req.method)
    logger.info('Utility functionality placeholder hit.', { userId: req.user.id, method: req.method });
    res.json({ message: `Utility endpoint is active for method ${req.method}.` });

  } catch (error) {
    next(error);
  }
});

export default router;
