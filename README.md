# ImmiGO

ImmiGO is a React and TypeScript web application for practicing the USCIS N-400 naturalization interview through voice or text conversation. Authenticated users can practice questions, receive spoken feedback, review conversation history, and generate session progress reports.

## Features

- Email authentication with AWS Amplify Auth.
- Voice practice with browser audio capture, voice activity detection, transcription, and Polly speech playback.
- Text chat as an alternative to voice practice.
- Server-authoritative civics answer grading with support for partial answers, confirmations, hints, repeats, and progress questions.
- Session persistence in Supabase, including conversation history and graded answers.
- Bedrock-generated daily progress reports with category feedback and review recommendations.
- Account settings, account deletion, transcript download, language and practice settings, and responsive desktop/mobile layouts.
- Error boundaries, structured client logging, correlation IDs, and focused unit, integration, and end-to-end tests.

## Technology

- React 18, TypeScript, Vite, Tailwind CSS
- AWS Amplify Gen 2 and CDK
- AWS Lambda, API Gateway, Bedrock, and Polly
- Supabase Auth and PostgreSQL
- Vitest, Testing Library, and Playwright
- ONNX Runtime Web and Silero VAD assets for browser audio processing

## Architecture

```text
Browser
  |
  | React UI, Amplify Auth, Supabase client, audio/VAD pipeline
  |
  +--> API Gateway REST API
         |
         +--> POST /transcript       -> transcript Lambda
         +--> POST /complete-session -> aggregateSession Lambda
         +--> POST /delete-account   -> deleteAccount Lambda
                                      |
                                      +--> Supabase
                                      +--> Bedrock / Polly
```

The frontend loads the API URL from the generated `amplify_outputs.json` file. `VITE_API_BASE_URL` can override it for local or alternate environments. Lambda resources and API Gateway wiring are defined in `amplify/backend.ts`; each function's runtime configuration is in its domain's `resource.ts`.

## Prerequisites

- Node.js 20 or newer
- npm
- An AWS account and Amplify CLI access
- A Supabase project with the repository migrations applied
- Bedrock model access for the configured Claude and Titan models
- Polly access for speech synthesis
- Browser microphone permission for voice practice

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file such as `.env.local`:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   # Optional when amplify_outputs.json does not contain the API URL:
   VITE_API_BASE_URL=https://your-api-gateway-url
   # Optional API Gateway key, when required by the deployed gateway:
   VITE_API_KEY=your-api-key
   ```

   Never put a Supabase service-role key, AWS secret, or other backend credential in a `VITE_` variable.

3. Apply the SQL migrations in `supabase/migrations/` to the target Supabase project.

4. Start the frontend:

   ```bash
   npm run dev
   ```

5. Open the URL printed by Vite, normally `http://localhost:5173`.

For a local Amplify backend, use the Amplify environment workflow for the target branch and regenerate `amplify_outputs.json` before running the frontend.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Run the build TypeScript check and create the Vite production build |
| `npm run lint` | Run ESLint with warnings treated as errors |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:coverage` | Run Vitest with coverage |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run deploy` | Build the frontend and run `amplify push` |
| `npm run preview` | Serve the production build locally |

Run a focused test file directly when iterating:

```bash
npx vitest run path/to/file.test.ts
npx playwright test tests/e2e/transcription_flow.spec.ts
```

## Backend Routes

All routes require a valid bearer token unless the handler explicitly changes that behavior.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/transcript` | Authenticates the user, evaluates a transcript or session start, generates feedback, and returns response text plus base64 MP3 audio. |
| `POST` | `/complete-session` | Aggregates a completed session into a daily progress report using stored messages and graded answers. |
| `POST` | `/delete-account` | Authenticates the caller and deletes the caller's Supabase account and associated data. |

The transcript Lambda uses a 60-second timeout and the session aggregation Lambda uses a 120-second timeout. Do not move long-running work into a synchronous browser request without checking these limits.

## Configuration And Secrets

Frontend configuration is intentionally limited to public values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL` (optional override)
- `VITE_API_KEY` (optional, only when the API Gateway requires it)

Backend configuration is supplied through Amplify resource definitions and deployment environment variables. `SUPABASE_SERVICE_ROLE_KEY` is backend-only and is used by the account-deletion Lambda. AWS credentials and service-role keys must never be committed or exposed to the browser.

## Project Layout

```text
src/                         React application, services, hooks, contexts, and UI
amplify/backend.ts           Amplify and API Gateway orchestration
amplify/auth/                Amplify email authentication
amplify/storage/             Amplify storage definition
amplify/functions/           Lambda resources, handlers, and transcript logic
supabase/migrations/         Database schema and security migrations
tests/unit/                  Unit tests
tests/integration/           Supabase and API integration tests
tests/e2e/                   Playwright browser tests
public/                      VAD and ONNX runtime assets
eval/stt/                    Speech-to-text evaluation runner and scoring tools
```

## Deployment

The repository's Amplify build configuration is in `amplify.yml`. It installs frontend and function dependencies, copies VAD and ONNX runtime assets, builds the Vite application, and deploys the Amplify backend for the configured branch.

Before deploying:

1. Confirm the target AWS and Supabase environment.
2. Apply pending Supabase migrations.
3. Confirm Bedrock model access, Polly permissions, and backend environment values.
4. Run `npm run lint`, `npm test`, and `npm run build`.
5. Deploy with the repository's approved Amplify workflow or `npm run deploy`.

## Troubleshooting

### Microphone or voice input does not work

Grant microphone permission to the browser, use a secure origin when required by the browser, and confirm that the VAD and ONNX assets are available under `public/` in the built application.

### Authentication or Supabase initialization fails

Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then confirm that the browser is using the intended environment file.

### API requests fail

Check that `amplify_outputs.json` contains `custom.apiBaseUrl`, or set `VITE_API_BASE_URL`. Inspect the response status and correlation ID, then check the corresponding Lambda logs.

### Progress reports fail

Confirm that the session contains persisted messages, the Supabase migrations are applied, and the aggregation Lambda has Bedrock and Supabase permissions.
