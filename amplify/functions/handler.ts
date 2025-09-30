import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';

import settingsRouter from './routes/settings';
import historyRouter from './routes/history';
import conversationRouter from './routes/conversation';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

app.use('/api', settingsRouter);
app.use('/api', historyRouter);
app.use('/api', conversationRouter);

export const handler = serverless(app);