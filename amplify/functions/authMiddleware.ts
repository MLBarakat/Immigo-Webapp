import { Request, Response, NextFunction } from 'express';
import { supabase } from './clients'; // Import the shared Supabase client
import { User } from '@supabase/supabase-js';

// Extend the Express Request type to include the user object
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication token is required.' });
    }

    const token = authHeader.split(' ')[1]?.trim();
    if (!token) {
        return res.status(401).json({ error: 'Bearer token is empty.' });
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Invalid or expired token.' });
        }

        req.user = user;
        next();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Authentication failed.';
        return res.status(401).json({ error: message });
    }
};