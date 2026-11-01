# ADR 0001 — Backend Architecture: Lambda Per Domain With Raw API Gateway Handlers

- **Status:** Accepted
- **Date:** 2026-10-31
- **Deciders:** ImmiGO maintainers
- **Supersedes:** The stale Express/serverless-http remediation plan archived in `docs/archive/`

## Context

ImmiGO has three backend domains:

- `transcript` — turn interpretation, civics grading, feedback, and Polly audio.
- `aggregateSession` — daily progress report generation.
- `deleteAccount` — authenticated account deletion.

The repository previously contained remediation documents that described an Express router layer with `serverless-http`. Those documents did not match the code. The actual handlers are raw API Gateway handlers using `APIGatewayProxyEvent` and `APIGatewayProxyResult`. No Express dependency exists.

## Decision

Keep one Lambda per domain and keep the handlers as raw API Gateway handlers. API Gateway, IAM, environment variables, and routes are wired in `amplify/backend.ts` and each function's `resource.ts`.

## Consequences

- Fewer moving parts and a smaller Lambda package.
- API Gateway request/response behavior is explicit and testable at the handler boundary.
- Shared middleware must be introduced as small, typed helpers, not as a framework.
- A new route belongs in an existing domain unless it has a distinct scaling, permission, or timeout profile.
- Introducing Express, `serverless-http`, or a shared router requires a new ADR.

## Enforcement

- `AGENTS.md` prohibits a new framework without an approved ADR.
- Handler contract tests protect status codes and payload shapes.
- `docs/ARCHITECTURE.md` describes the actual wiring.
