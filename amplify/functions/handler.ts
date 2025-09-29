import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';

// Import your new, separated route handlers
import settingsRouter from './routes/settings';
import historyRouter from './routes-history';
import conversationRouter from './routes/conversation';

const app = express();

// --- Global Middleware ---
app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// --- API Routes ---
app.use('/api', settingsRouter);
app.use('/api', historyRouter);
app.use('/api', conversationRouter);

// This is the handler that API Gateway will invoke for all requests
export const handler = serverless(app);