## Quick context

This is a React + TypeScript single-page app (Vite) frontend that talks to a serverless API (AWS Lambda/APIGateway via Amplify) providing streaming AI responses (text + audio). Key goals: low-latency voice interactions, barge-in support, and session control.

## What to know first

- Frontend entry: `src/main.tsx` → `src/App.tsx`. UI state is in `context/ConversationContext.tsx` and `context/AuthContext.tsx`.
- Conversation orchestration lives in `src/hooks/useConversationManager.ts` (uses `DeepgramManager` in `src/utils/audioUtils.ts` for microphone streaming) and calls `src/services/apiClient.ts`.
- API client stream: `ApiClient.sendMessage` connects to `${VITE_API_BASE_URL}/conversation` and expects an SSE-like JSON stream with chunks of `{ type: 'text'|'audio', data: ... }`. The client parses each chunk and calls `onTextChunk` / `onAudioChunk` callbacks.

## Architecture & integration notes

- Backend is defined under `amplify/` using the Amplify backend DSL (`amplify/backend.ts`). Lambda is granted Bedrock and Polly permissions and expects environment secrets (see `backend.ts` for env names: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEEPGRAM_API_KEY`, `API_KEY`).
- Auth: Supabase is used for frontend auth (`src/supabaseClient.ts`). The app expects a Supabase session object from `useAuth` hooks; the session token is passed to `new ApiClient(session.access_token)`.
- Streaming behavior: The server streams tokenized text and base64-encoded audio frames. Keep parsing tolerant — chunks may not align to JSON boundaries (see `ApiClient.sendMessage` for current decoding approach).

## Common developer workflows

- Install & run frontend dev server:

  npm install
  npm run dev

- Build for production:

  npm run build

- Linting:

  npm run lint

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
