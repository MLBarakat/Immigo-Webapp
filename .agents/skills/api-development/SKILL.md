---
name: api-development
description: Use when adding or changing an ImmiGO API route, Lambda handler, request/response contract, or WebSocket behavior. Covers auth, validation, status codes, CORS, and contract tests.
---

# API Development

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/CONSTITUTION.md`, `docs/FEATURES.md` (F-13), `docs/ARCHITECTURE.md`.

Use this skill for `POST /transcript`, `POST /complete-session`, `POST /delete-account`, or any new API behavior. The backend uses raw API Gateway handlers. Do not introduce Express, `serverless-http`, or a shared router.

## Project rules

- Read the target `handler.ts`, `resource.ts`, and `amplify/backend.ts` before editing.
- Confirm the contract from existing code: method, path, auth header, request shape, response shape, status codes, CORS headers, and correlation header.
- Validate external input at the boundary. Use `unknown` plus a type guard; do not cast untrusted JSON with `as`.
- Preserve the response shape unless a feature spec explicitly changes it.
- Return `400` for invalid input, `401` for missing/invalid auth, and `500` for downstream failure. Do not leak stack traces or secrets.
- Never log raw authorization headers, tokens, transcripts, or unnecessary PII.
- Keep Lambda work inside its timeout: 60s for `transcript`, 120s for `aggregateSession`.
- Add or update the frontend `ApiClient` type in the same change.

## Workflow

1. Find the feature ID in `docs/features.json`.
2. Read the handler contract test or write one that fails.
3. Change the smallest part of the handler.
4. Cover success, validation, auth, downstream failure, and empty/retry behavior.
5. Run the focused test, then `npm run verify`.
6. Update the feature registry if the contract changed.

## Done when

- [ ] The handler still uses `APIGatewayProxyEvent` / `APIGatewayProxyResult`.
- [ ] Auth is validated server-side before work.
- [ ] Status codes and payloads match the documented contract.
- [ ] Contract tests cover success and failure paths.
- [ ] `npm run verify` passes.
- [ ] `docs/FEATURES.md` and `docs/features.json` are updated when behavior changed.
