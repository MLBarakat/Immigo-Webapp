import { Request, Response, NextFunction } from 'express';
import { supabase } from './clients'; // Import the shared Supabase client

// Extend the Express Request type to include the user object
declare global {
    namespace Express {
        interface Request {
            user?: any;
        }
    }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication token is required.' });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    req.user = user; // Attach user to the request object
    next();
};