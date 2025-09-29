import { Router } from 'express';
import { registerUser, loginUser } from '../controllers/authController';

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    await registerUser(req, res);
  } catch (error) {
    // Pass the error to the centralized error handler
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    await loginUser(req, res);
  } catch (error) {
    // Pass the error to the centralized error handler
    next(error);
  }
});

export default router;