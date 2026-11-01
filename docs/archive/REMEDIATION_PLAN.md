# ARCHIVED - HISTORICAL ONLY

> **Do not follow this document.** It describes an architecture that does not exist in the repository. The current backend uses raw API Gateway Lambda handlers, not Express or serverless-http. See AGENTS.md, docs/ARCHITECTURE.md, and docs/adr/0001-backend-architecture.md.

---

# IMMIGO Webapp - GEMINI.md Compliance Remediation Plan

**Status:** DRAFT - REVISED FOR REVIEW  
**Primary Goal:** Bring backend and frontend code into measurable compliance with `.gemini/GEMINI.md` without changing architecture unnecessarily.  
**Execution Rule:** Each phase must be completed, verified, and reviewed before moving to the next phase.

---

## Guiding Decisions

1. **Keep Lambda-per-function architecture.**
   - `conversation.ts` remains responsible for `/api/conversation`.
   - `analyze.ts` remains responsible for `/api/analyze`.
   - Do not merge multiple domains into one Lambda.

2. **Use existing project patterns.**
   - Lambda entry files live in `amplify/functions/<function>.ts`.
   - Route logic lives in `amplify/functions/routes/<function>.ts`.
   - REST routes remain wired in `amplify/backend.ts`.

3. **Do not introduce new tooling by default.**
   - No Husky, new libraries, new frameworks, or custom lint plugins unless explicitly approved.

4. **Treat compliance as measurable.**
   - Replace estimated claims like "70%" or "100%" with concrete audit results and command output.

5. **Protect existing work.**
   - Do not use `git reset --hard`.
   - Do not use broad rollback commands that can erase unrelated user changes.
   - Before each phase, inspect changed files and only edit the files required for that phase.

---

## Phase 0: Verified Baseline Audit

**Objective:** Replace assumptions with confirmed findings before refactoring.  
**Risk:** Low  
**Required before code changes:** Yes

### Tasks

1. Review source-of-truth standards:
   - `.gemini/GEMINI.md`
   - `amplify/functions/tsconfig.json`
   - `package.json`
   - `amplify/backend.ts`
   - `amplify/api/resources.ts`

2. Record current backend function structure:
   - `amplify/functions/analyze.ts`
   - `amplify/functions/conversation.ts`
   - `amplify/functions/config.ts`
   - `amplify/functions/transcript.ts`
   - `amplify/functions/settings.ts`
   - `amplify/functions/history.ts`
   - `amplify/functions/utility.ts`

3. Audit for known violations:
   ```powershell
   rg "APIGatewayProxyEvent|APIGatewayProxyResult|createErrorResponse|console\.|:\s*any|as any|catch \(error\).*res\.status" amplify src -n
   rg "express|serverless|next\(error\)|new AppError|authenticate" amplify/functions -n
   ```

4. Run baseline verification commands:
   ```powershell
   npm run lint
   npm run build
   npx tsc -p amplify/functions/tsconfig.json --noEmit
   ```

5. If git commands are needed and fail due safe-directory ownership, fix that explicitly before relying on git status:
   ```powershell
   git config --global --add safe.directory "C:/Users/Mohamed Barakat/OneDrive - Veeva Systems, Inc/Immigo Project/Immigo-Webapp"
   git status --short
   ```

### Deliverable

Create an audit section at the top of this file or a separate `REMEDIATION_AUDIT.md` containing:

- Actual violations found
- Exact files affected
- Baseline command results
- Any pre-existing unrelated worktree changes

### Exit Criteria

- Findings are based on the actual repo, not assumptions.
- The next phase has a known file list.
- Build/lint/typecheck baseline status is documented.

---

## Phase 1: Backend Architecture Alignment

**Objective:** Convert raw Lambda handlers to the established Express entry + route pattern while preserving Lambda-per-function separation.  
**Risk:** High

### Scope

Likely targets based on current repo shape:

- `amplify/functions/conversation.ts`
- `amplify/functions/transcript.ts`
- `amplify/functions/config.ts`

Do not modify `analyze.ts`, `settings.ts`, `history.ts`, or `utility.ts` unless the Phase 0 audit shows a concrete issue.

### Required Pattern

Lambda entry file:

```ts
import express, { Request, Response, NextFunction } from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './logger';
import { AppError } from './errors';
import router from './routes/<name>';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use('/api', router);

app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Route not found: ${req.method} ${req.path}`, 404));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const appError = err instanceof AppError
    ? err
    : new AppError('Unexpected error', 500, false);

  logger.error(appError.message, appError);

  const message = process.env.NODE_ENV === 'development'
    ? appError.message
    : 'Internal server error';

  res.status(appError.statusCode).json({ error: message });
});

export const handler = serverless(app);
```

Route file:

```ts
import { Router } from 'express';
import { authenticate } from '../authMiddleware';
import { logger } from '../clients';
import { AppError } from '../errors';

const router = Router();

router.post('/conversation', authenticate, async (req, res, next) => {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);

    logger.debug('POST /conversation request', { userId: req.user.id });

    // Business logic here.

    res.status(200).json({ message: 'OK' });
  } catch (error) {
    next(error);
  }
});

export default router;
```

### Tasks

1. Refactor `conversation.ts`.
   - Move route logic into `amplify/functions/routes/conversation.ts`.
   - Keep only `/conversation` behavior in the conversation Lambda.
   - Remove embedded `/analyze` behavior from `conversation.ts`.
   - Confirm `/api/analyze` remains served by `analyzeFunction`.
   - Preserve Bedrock, Polly, Supabase behavior unless a bug is found.

2. Refactor `transcript.ts`.
   - Move route logic into `amplify/functions/routes/transcript.ts`.
   - Replace manual CORS and raw API Gateway response handling with Express middleware.
   - Use `authenticate` for protected transcript operations.

3. Refactor `config.ts`.
   - Move route logic into `amplify/functions/routes/config.ts`.
   - Apply `authenticate` only if the endpoint is intended to be protected.
   - Keep public config responses limited to non-sensitive values.

4. Verify `amplify/backend.ts`.
   - `/api/conversation` uses `conversationFunction`.
   - `/api/analyze` uses `analyzeFunction`.
   - `/api/transcript` uses `transcriptFunction`.
   - `/api/config` uses `configFunction`.

### Exit Criteria

- No raw REST Lambda handlers remain except where intentionally documented.
- Each domain has its own Lambda.
- Each refactored Lambda has route file separation.
- `npm run build` and backend typecheck pass or failures are documented as pre-existing.

---

## Phase 2: Backend Error Handling Standardization

**Objective:** Ensure expected errors use `AppError` and all route catch blocks delegate to centralized middleware.  
**Risk:** Medium

### Correct Rule

- Success responses may use `res.status(...).json(...)`.
- Expected failures should throw `AppError`.
- Route `catch` blocks must call `next(error)`.
- Route `catch` blocks must not send error responses directly.
- Central error middleware logs and formats errors.

### Tasks

1. Audit all route files:
   ```powershell
   rg "catch|res\.status|new AppError|next\(error\)" amplify/functions/routes -n
   ```

2. Fix expected error paths:
   - Missing auth state -> `throw new AppError('Unauthorized', 401)`
   - Invalid request body -> `throw new AppError('<field> required', 400)`
   - Missing resource -> `throw new AppError('<resource> not found', 404)`
   - External service/database failures -> throw or allow the original error to reach middleware, with context logged where useful.

3. Confirm every Express entry file has:
   - Route registrations before error middleware
   - 404 middleware before central error middleware
   - Central error middleware as the final middleware

### Exit Criteria

- No route `catch` block sends `res.status(...).json(...)`.
- Expected failures use `AppError`.
- All route `catch` blocks call `next(error)`.
- Central error middleware exists in each Express Lambda entry.

---

## Phase 3: Logging Normalization

**Objective:** Remove direct console usage from backend application code and standardize logger usage.  
**Risk:** Low

### Accepted Exceptions

- `amplify/functions/logger.ts` may use `console.log` or `console.error` as the logger output sink.
- Build scripts may use console output.
- Test files may use console output if explicitly justified.

### Tasks

1. Audit console usage:
   ```powershell
   rg "console\.(log|error|warn|info|debug)" amplify src scripts -n
   ```

2. Fix backend violations:
   - Lambda entry files import logger from `./logger`.
   - Route files import logger from `../clients`.
   - Do not log the same error both in route code and central error middleware unless adding important domain context.

3. Fix frontend violations only where appropriate:
   - `src/logger.ts` may use console as the browser logger sink.
   - Components, hooks, services, and workers should use the frontend logger instead of direct console calls.

### Exit Criteria

- Backend direct console usage exists only in the logger implementation or documented exceptions.
- Logs include useful context such as `userId`, route name, or operation name without exposing secrets.

---

## Phase 4: Type Safety

**Objective:** Reduce unsafe `any` usage and ensure strict TypeScript remains meaningful.  
**Risk:** Medium

### Tasks

1. Audit unsafe typing:
   ```powershell
   rg ":\s*any|as any|unknown" src amplify/functions -n
   ```

2. Replace `any` with:
   - Request body interfaces
   - Response interfaces
   - Narrowed `unknown` in error or third-party response boundaries
   - Existing Supabase/AWS SDK types where available

3. Keep `unknown` where it is genuinely safer than pretending to know the shape.

4. Verify strict settings:
   - Root and frontend TypeScript configs
   - `amplify/functions/tsconfig.json`

### Exit Criteria

- No avoidable `any` in application code.
- Remaining `any` usages are documented and justified.
- TypeScript checks pass.

---

## Phase 5: Duplication and Shared Utilities

**Objective:** Remove duplicated auth, CORS, error-response, validation, and client setup logic after the architecture is stable.  
**Risk:** Medium

### Tasks

1. Confirm shared utilities:
   - `amplify/functions/authMiddleware.ts`
   - `amplify/functions/clients.ts`
   - `amplify/functions/errors.ts`
   - `amplify/functions/logger.ts`

2. Remove duplicated patterns:
   - Manual token parsing inside route handlers
   - Hardcoded CORS headers in handlers
   - Ad hoc error response helpers
   - Duplicate Supabase or AWS client initialization

3. Add validation helpers only if duplication is meaningful.
   - Do not create a new abstraction for one route.
   - Prefer small typed functions over a new validation library.

### Exit Criteria

- Protected routes use `authenticate`.
- Shared clients are initialized in one place.
- No duplicate CORS or error response helpers remain.
- New helpers are justified by repeated use.

---

## Phase 6: Frontend Error Handling

**Objective:** Ensure frontend errors are surfaced, logged, and recoverable where appropriate.  
**Risk:** Medium

### Tasks

1. Verify global error coverage:
   - `src/ErrorBoundary.tsx`
   - `src/main.tsx`
   - global `error` and `unhandledrejection` listeners if present

2. Review API error propagation:
   - `src/services/apiClient.ts`
   - hooks under `src/hooks/`
   - worker error messages under `src/workers/`

3. Ensure user-facing flows have:
   - Loading state
   - Error state
   - Retry or recovery path where practical
   - Logger context for diagnostics

### Exit Criteria

- API errors are not silently swallowed.
- Recoverable failures show useful UI.
- Unexpected render failures reach the error boundary.

---

## Phase 7: Prevention

**Objective:** Add low-friction checks that prevent regression without introducing unnecessary tooling.  
**Risk:** Low

### Tasks

1. Review existing ESLint config.
   - Enforce `no-console` for backend application code, with an override for `amplify/functions/logger.ts`.
   - Enforce `@typescript-eslint/no-explicit-any` if the codebase can pass after Phase 4.

2. Avoid custom rules unless the benefit clearly outweighs maintenance cost.

3. Add a PR checklist only if the repo already has GitHub templates or the team wants one.

4. Add Husky or pre-commit hooks only with explicit approval.

### Exit Criteria

- `npm run lint` passes.
- `npm run build` passes.
- `npx tsc -p amplify/functions/tsconfig.json --noEmit` passes.
- Any intentionally unenforced standard is documented.

---

## Verification Commands

Run after each phase that changes code:

```powershell
npm run lint
npm run build
npx tsc -p amplify/functions/tsconfig.json --noEmit
```

Optional targeted checks:

```powershell
rg "APIGatewayProxyEvent|APIGatewayProxyResult|createErrorResponse" amplify/functions -n
rg "console\.(log|error|warn|info|debug)" amplify src scripts -n
rg ":\s*any|as any" src amplify/functions -n
```

---

## Rollback Strategy

Use the least destructive rollback possible.

1. Prefer small commits after each phase.
2. If a phase must be reverted, revert that phase commit:
   ```powershell
   git revert <commit-sha>
   ```
3. If a file must be restored, inspect status first and restore only the specific file after confirming it contains no unrelated user work:
   ```powershell
   git status --short
   git diff -- <path>
   git restore -- <path>
   ```
4. Do not use:
   ```powershell
   git reset --hard
   git checkout -- .
   git checkout -- amplify/functions/
   git checkout -- src/
   ```

---

## Current Priority Order

1. Phase 0 baseline audit
2. Phase 1 backend architecture alignment
3. Phase 2 backend error handling
4. Phase 3 logging normalization
5. Phase 4 type safety
6. Phase 5 duplication cleanup
7. Phase 6 frontend error handling
8. Phase 7 prevention

---

## Approval Gate

Before implementation starts, confirm:

- Whether Phase 0 should create `REMEDIATION_AUDIT.md` or update this file directly.
- Whether tooling changes such as Husky are allowed later.
- Whether public `/api/config` should remain unauthenticated.

