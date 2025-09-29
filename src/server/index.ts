import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import authRoutes from './routes/authRoutes';
import errorHandler from './middleware/errorHandler';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 8080;

// --- Security Middleware Implementation ---

// 1. Set various HTTP headers for security
app.use(helmet());

// 2. Configure CORS with a whitelist for production
const allowedOrigins = ['http://localhost:3000', 'https://app.immigo.io']; // Example domains

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};
app.use(cors(corsOptions));


// 3. Rate Limiting to prevent brute-force attacks
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	limit: 100, // Limit each IP to 100 requests per window
	standardHeaders: 'draft-7',
	legacyHeaders: false,
});
app.use(limiter);

// --- Standard Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- API Routes ---
app.get('/', (req: Request, res: Response) => {
  res.send('ImmiGO API Server is running!');
});

app.use('/api/auth', authRoutes);


// --- Centralized Error Handling ---
// This middleware MUST be the last one to be registered
app.use(errorHandler);


// --- Server Initialization ---
app.listen(PORT, () => {
  console.log(`[server]: Server is running at http://localhost:${PORT}`);
});

export default app; // Export for testing purposes