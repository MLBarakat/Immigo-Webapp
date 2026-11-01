# ARCHIVED - HISTORICAL ONLY

> **Do not follow this document.** It describes an architecture that does not exist in the repository. The current backend uses raw API Gateway Lambda handlers, not Express or serverless-http. See AGENTS.md, docs/ARCHITECTURE.md, and docs/adr/0001-backend-architecture.md.

---

# IMMIGO Webapp - GEMINI.md Compliance Audit Results

**Status:** REVISED - PHASE 1 COMPLETED  
**Last Updated:** June 26, 2026  

This audit tracks the files, line numbers, and patterns that deviate from the standards set in `.gemini/GEMINI.md`. This document is updated dynamically as each remediation phase completes.

---

## 1. Raw Lambda Handlers (Phase 1 Targets) â€” [RESOLVED / COMPLETED]

All core backend Lambda entry points have been systematically refactored from raw, monolithic `APIGatewayProxyEvent` handlers into clean, isolated Express entry apps wrapped with `serverless-http`. Business logic has been completely separated into sub-router modules under `amplify/functions/routes/`.

### Refactored Changes Summary:
* **`amplify/functions/config.ts` & `routes/config.ts`**: Converted to an Express app with `helmet`, `cors`, and centralized error middleware. The circular dependency issue caused by top-level file evaluation inside `clients.ts` was permanently fixed by sourcing `logger` straight from `../logger`.
* **`amplify/functions/conversation.ts` & `routes/conversation.ts`**: Re-architected into an Express micro-router layout. Explicit `express.json()` body-parsing middleware was injected to safely unpack incoming payloads into structured data models. Embbeded Claude AI analysis rules were safely migrated to a dedicated route module to prevent schema drift.
* **`amplify/functions/transcript.ts` & `routes/transcript.ts`**: Standardized into an Express router wrapper, eliminating raw API Gateway dictionary constructions and manual CORS object mapping.

**Open Phase 1 Violations Remaning:** None. Zero raw REST handlers remain in the application layer.

---

## 2. Direct Console Logging (Phase 3 Targets)

### Backend
* **Clean!** There are no direct `console.log` or similar calls in the backend application code outside of `amplify/functions/logger.ts` (which is the permitted global sink).

### Frontend
The following frontend files contain raw console logs that should be updated during Phase 3 to use the centralized frontend logging utility (`src/logger.ts`):

* **src/utils/audioUtils.ts**
  * Line 57: `console.error('Error decoding audio data:', error);`
  * Line 89: `console.log('WebSocket connection opened.');`
  * Line 104: `console.log('MediaRecorder started.');`
  * Line 115: `console.error('WebSocket error:', error);`
  * Line 120: `console.log('WebSocket connection closed.');`
  * Line 125: `console.error('Error starting microphone:', err);`
  * Line 134: `console.log('MediaRecorder stopped.');`
* **src/hooks/useWhisper.ts**
  * Line 306: `console.error('Whisper worker runtime error:', e);`
  * Line 309: `console.error('Whisper worker message error:', e);`
  * Line 342: `console.warn('Failed to send ping to worker:', e);`
* **src/context/AuthContext.tsx**
  * Line 42: `console.error("Error fetching user profile:", profileError.message);`
  * Line 48: `console.error("Error in session/profile fetch:", err);`
  * Line 104: `console.error("Failed to update user language in profile:", error.message);`
* **src/analytics.ts**
  * Line 6: `console.log(\`[ANALYTICS] Event: \${eventName}\`, properties || '');`

---

## 3. Type Safety / Unsafe `any` Usage (Phase 4 Targets)

The following files contain loose type declarations or bypass explicit validation structures using the explicit `any` compiler override mask. These will be targeted systematically during Phase 4:

* **amplify/functions/logger.ts**
  * Line 7: `[key: string]: any;`
  * Line 46: `error?: any`
  * Line 47: `[key: string]: any`
* **amplify/functions/routes/conversation.ts** (Carried over from legacy file split)
  * Line reference shifts: Loose typed declarations inside intermediate data handlers, operational error mappings, and catch blocks.

---

## 4. Current Build & Validation Status

* **Git Status:** Functional worktree adjustments staged under the active `dev` tracking branch.
* **Linter (npm run lint):** Fails with **71 problems** (68 errors, 3 warnings).
  * Major issues discovered:
    * **`resources.ts`**: Unused variable `deepgramURL`.
    * **`AnimatedStatusButton.tsx`**: Sub-component `BaseMicIcon` is created inline during a parent render loop (Line 32).
    * **`useMediaQuery.ts`**: Synchronous state updates executed unsafely within an effect body on component mount.
    * **`useWhisper.ts`**: Missing dependency arrays inside tracking effects and hooks, direct raw configuration object manipulation on `window.__ASR`, and loose lexical variable scoping in worker event case blocks.
* **Backend Typecheck (npx tsc -p amplify/functions/tsconfig.json --noEmit):** **PASSES successfully** with zero compilation or resolution errors.
* **Frontend Build (npm run build):** Fails on localized environments due to a missing optional platform compiler reference (`Cannot find module @rollup/rollup-win32-x64-msvc`). This is an external hardware environment mounting block rather than an application-level syntax bug.
