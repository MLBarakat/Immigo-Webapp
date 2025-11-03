## Quick context

This is a React + TypeScript single-page app (Vite) frontend that talks to a serverless backend on AWS, built with Amplify Gen 2. The backend provides a REST API for standard actions and a WebSocket API for real-time, low-latency voice processing with AI-driven responses.

## Core Architectural Patterns

### Backend: Lambda per Function

The backend follows a "Lambda per function" microservice architecture. Each distinct piece of functionality (`config`, `settings`, `history`, `conversation`, `analyze`, `utility`, `websocket`) is its own self-contained Lambda function with a dedicated entry point in `amplify/functions/`. This enforces separation of concerns and allows for independent resource allocation.

- **API Gateway:** The backend exposes two separate API Gateways:
    - A **REST API** for all standard HTTP requests (e.g., `GET /api/settings`).
    - A **WebSocket API** for real-time communication, which proxies to the Deepgram service.
- **Entry Points:** Each function has a corresponding entry point file (e.g., `amplify/functions/settings.ts`) that sets up a minimal Express.js app for that specific function's routes. The one exception is `websocket.ts`, which is a pure event-driven handler.
- **Routing:** All API routes and their corresponding Lambda integrations are defined in `amplify/backend.ts`.

### Staging: Dev & Prod

The backend is designed for multiple stages (e.g., `dev`, `prod`). This is controlled by a **build-time environment variable**, `APP_ENV`. This is the single source of truth for determining the environment.

- **Usage:** You must set this variable before deploying. For example:
  - `APP_ENV=dev npx amplify pipeline-deploy ...`
  - `APP_ENV=prod npx amplify pipeline-deploy ...`
- **Effect:** This variable dynamically:
  1.  Sets the API Gateway stage name (to `dev` or `prod`).
  2.  Sets the `NODE_ENV` for all Lambda functions (`development` or `production`).
  3.  Sets the `LOG_LEVEL` for all Lambda functions (`DEBUG` for dev, `INFO` for prod).

### Logging & Error Handling

A robust, centralized, and environment-aware framework is in place for both backend and frontend.

- **Backend (`amplify/functions/logger.ts`):** A centralized logger provides structured JSON logging. It respects the `LOG_LEVEL` environment variable. All logs are easily searchable in CloudWatch.
- **Backend (`amplify/functions/errors.ts`):** A custom `AppError` class is used to create detailed, meaningful errors with HTTP status codes.
- **Backend Pattern:** Each function's Express app has a standard middleware chain for request logging, 404s, and a final centralized error handler. When writing new routes, do not handle errors inside the route handler. Instead, throw an `AppError` and pass it to the `next()` function: `catch (error) { next(error); }`.
- **Frontend (`src/logger.ts`, `src/ErrorBoundary.tsx`):** The frontend has a parallel system with a browser logger, a global React Error Boundary to prevent UI crashes, and global listeners in `main.tsx` to catch any unhandled errors.

### Configuration: Environment Variables vs. Secrets

Configuration is handled with a specific hybrid strategy. Understanding this is critical.

- **Branch Environment Variables (Amplify Console UI):** Use these for **non-sensitive, public values**. The primary example is `SUPABASE_URL`. These are inherited by the Lambda functions at runtime *only if* they are not explicitly defined in `backend.ts`.
- **Amplify App Secrets (CLI):** Use these for **all sensitive keys**. They are set via the CLI (`npx amplify pipeline-secret set MY_SECRET_KEY`) and are securely injected into the Lambda functions that need them. This is configured via `backend.configFunction.addEnvironment('MY_KEY', secret('MY_SECRET_KEY'))` in `backend.ts`.

---

## Tutorial: Adding a New `/api/feedback` Endpoint

This is a step-by-step guide to adding a new `POST /api/feedback` endpoint.

### Step 1: Create the Route File

Create `amplify/functions/routes/feedback.ts`. This file contains the actual business logic.

```typescript
// amplify/functions/routes/feedback.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../authMiddleware';
import { logger } from '../clients';
import { AppError } from '../errors';

const router = Router();

router.post('/feedback', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  logger.debug('POST /feedback request received', { userId: req.user?.id });
  try {
    if (!req.user) {
      throw new AppError('User not authenticated.', 401);
    }
    const { feedback } = req.body;
    if (!feedback) {
      throw new AppError('Feedback content is required.', 400);
    }

    // TODO: Add logic to save feedback to the database
    logger.info('Feedback received successfully', { userId: req.user.id });
    res.status(201).json({ message: 'Feedback received.' });

  } catch (error) {
    next(error);
  }
});

export default router;
```

### Step 2: Create the Lambda Entry Point

Create `amplify/functions/feedback.ts`. This file sets up the mini Express app for this one function.

```typescript
// amplify/functions/feedback.ts
import express, { Request, Response, NextFunction } from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './logger';
import { AppError } from './errors';
import feedbackRouter from './routes/feedback';

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use('/api', feedbackRouter);

// Centralized error handling middleware
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const appError = err instanceof AppError ? err : new AppError('An unexpected error occurred in the feedback service.', 500, false);
  logger.error(appError.message, appError, { path: req.path });
  const errorMessage = process.env.NODE_ENV === 'development' ? appError.message : 'An internal server error occurred.';
  res.status(appError.statusCode).json({ error: errorMessage });
});

export const handler = serverless(app);
```

### Step 3: Define the Function in `resources.ts`

Open `amplify/api/resources.ts` and add the function definition.

```typescript
// In amplify/api/resources.ts, add:
export const feedbackFunction = defineFunction({
  entry: '../functions/feedback.ts',
  environment: {
    NODE_ENV: nodeEnv,
    LOG_LEVEL: logLevel,
    FUNCTION_TYPE: 'feedback',
  }
});
```

### Step 4: Wire up the Infrastructure in `backend.ts`

Finally, open `amplify/backend.ts` and add the necessary constructs.

```typescript
// In amplify/backend.ts

// 1. Import the new function at the top
import { ..., feedbackFunction } from './api/resources';

// 2. Add the function to defineBackend
const backend = defineBackend({
  // ... other functions
  feedbackFunction,
});

// 3. Create the Lambda integration
const feedbackIntegration = new apigateway.LambdaIntegration(backend.feedbackFunction.resources.lambda, { proxy: true });

// 4. Add the route to the API Gateway
apiRoot.addResource('feedback').addMethod('POST', feedbackIntegration);

// 5. Add any necessary environment variables/secrets
backend.feedbackFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
```

## Debugging Workflow

- **Goal:** Trace a single failed request through the system.
- **DEV Environment:** Make sure you have deployed with `APP_ENV=dev` and have set `NODE_ENV=development` in your Amplify Console branch variables. This ensures `DEBUG` logs are captured.
- **Find the Request ID:** In the `conversation.ts` router, a `requestId` is generated for each request and logged. Find this ID in your browser's network tab or in the initial log.
- **Filter in CloudWatch:** Go to the CloudWatch Log Group for the relevant Lambda function (e.g., `/aws/lambda/amplify-...-conversationFunction-...`). Use the filter bar to search for the `requestId`. This will show you all log entries (debug, info, and error) for that specific request, allowing you to see the exact sequence of events and the context of any errors.