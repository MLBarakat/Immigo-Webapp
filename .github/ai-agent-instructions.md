## Quick context

This is a React + TypeScript single-page app (Vite) frontend that talks to a serverless API (AWS Lambda/APIGateway via Amplify) providing streaming AI responses (text + audio). Key goals: low-latency voice interactions, barge-in support, and session control.

## What to know first

- Frontend entry: `src/main.tsx` → `src/App.tsx`. UI state is in `context/ConversationContext.tsx` and `context/AuthContext.tsx`.
- Conversation orchestration lives in `src/hooks/useConversationManager.ts` (uses `DeepgramManager` in `src/utils/audioUtils.ts` for microphone streaming) and calls `src/services/apiClient.ts`.
- API client stream: `ApiClient.sendMessage` connects to `${VITE_API_BASE_URL}/conversation` and expects an SSE-like JSON stream with chunks of `{ type: 'text'|'audio', data: ... }`. The client parses each chunk and calls `onTextChunk` / `onAudioChunk` callbacks.

## Architecture & integration notes

### Backend

The backend is defined in `amplify/backend.ts` using the Amplify backend DSL. It consists of four Lambda functions:

- **`conversationFunction`**: Handles the main conversation logic, including Bedrock and Polly integration.
- **`analyzeFunction`**: Provides conversation analysis and feedback.
- **`utilityFunction`**: Manages user settings and history.
- **`configFunction`**: Serves public configuration.

The backend also features:

- **API Gateway:** A REST API with the following endpoints:
    - `POST /api/conversation`: Main conversation endpoint.
    - `POST /api/analyze`: Conversation analysis endpoint.
    - `GET /api/history`: Retrieves conversation history.
    - `GET /api/settings`: Retrieves user settings.
    - `PUT /api/settings`: Updates user settings.
    - `GET /api/config`: Retrieves public configuration.
- **Auto-scaling and Monitoring:** CloudWatch alarms and auto-scaling are configured for the Lambda functions to handle varying loads.
- **IAM Policies:** The Lambda functions have IAM policies for Bedrock, Polly, and other necessary services.
- **Environment Variables:** The functions use secrets for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEEPGRAM_API_KEY`, and `SUPABASE_API_KEY`.

### Frontend

- **Authentication:** Supabase is used for frontend auth (`src/supabaseClient.ts`). The app expects a Supabase session object from `useAuth` hooks; the session token is passed to `new ApiClient(session.access_token)`.
- **API Client:** The `ApiClient` in `src/services/apiClient.ts` handles all communication with the backend. It includes the `Authorization` header with a bearer token and an `X-API-Key` header.
- **Streaming behavior:** The server streams tokenized text and base64-encoded audio frames. Keep parsing tolerant — chunks may not align to JSON boundaries (see `ApiClient.sendMessage` for current decoding approach).
- **Feedback Feature:** The app includes a feedback feature that allows users to get an analysis of their conversation. This feature is handled by the `handleRequestFeedback` function in `src/App.tsx` and the `/api/analyze` endpoint.
- **Analytics:** The app tracks analytics events using an `analytics` object. Events include `session_started`, `session_ended`, `conversation_cleared`, and `transcript_downloaded`.

## Common developer workflows

- Install & run frontend dev server:

  ```bash
  npm install
  npm run dev
  ```

- Build for production:

  ```bash
  npm run build
  ```

- Linting:

  ```bash
  npm run lint
  ```

- Deploy:

  ```bash
  npm run deploy
  ```

- Backend / Amplify:

  The Amplify backend is defined with CDK-like constructs in `amplify/backend.ts`. Use Amplify/Backend CLI when deploying. Check your Amplify/CLI workflow (not stored here) — typical steps: `amplify push` or `npm run` scripts in `amplify/` if added.

## Project-specific conventions

- API base URL and keys are provided via Vite env vars: `VITE_API_BASE_URL`, `VITE_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- UI settings are saved via `ApiClient.getSettings()` / `updateSettings()`; `App.tsx` caches them in local state and applies CSS classes for theme and font size (see `App.tsx` effect that toggles `root.classList` and body font classes).
- Conversation state transitions are managed via the `ConversationContext` reducer — prefer dispatching existing action types (`SEND_MESSAGE_START`, `RECEIVE_ASSISTANT_CHUNK`, `FINISH_ASSISTANT_RESPONSE`, etc.) to keep UI consistent.

## Common pitfalls for code edits

- Streaming parser fragility: do not assume each read() yields a complete JSON object. The existing `ApiClient.sendMessage` decodes per read and JSON.parse; if you change streaming logic, add robust framing or line-delimited JSON handling.
- Auth token lifecycle: `ApiClient` is created from `session.access_token` in `App.tsx`. When modifying auth flows, ensure components recreate `ApiClient` when session changes.
- Deepgram/Audio: `useConversationManager` instantiates `DeepgramManager` and passes `sendTextMessage` as a callback. Avoid circular dependencies and ensure `DeepgramManager.startListening` calls the correct callback signature.

## Files to reference for examples

- `src/services/apiClient.ts` — streaming API client & auth headers example
- `src/hooks/useConversationManager.ts` — how to start/stop sessions, handle transcript & audio
- `src/App.tsx` — where settings are loaded/applied and `ApiClient` is created
- `amplify/backend.ts` — serverless backend hints, permissions, and env names
- `src/supabaseClient.ts` — Supabase initialization and required env vars

## If you need to add features

- When adding new streamed events, update both `ApiClient.sendMessage` parsing and the reducer action handlers in `context/ConversationContext.tsx`.
- For new environment variables, add `VITE_`-prefixed names for frontend usage and set the corresponding Lambda env variables in `amplify/backend.ts`.

## Quick tests & verification

- Manual smoke test: run frontend (`npm run dev`), sign in via Supabase, start a conversation, and verify streaming text appears and audio plays.
- Unit tests: none in repo. Prefer small manual smoke checks and a targeted script if you add automated tests.

---

If any section is unclear or you want more detail (examples of conversation reducer actions, audio framing, or Amplify deploy commands you use locally), tell me which area to expand.