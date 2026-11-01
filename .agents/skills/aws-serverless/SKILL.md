---
name: aws-serverless
description: Use when changing Amplify Gen 2 resources, Lambda deployment, API Gateway, IAM, environment variables, storage, or backend secrets.
---

# AWS Serverless

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/ARCHITECTURE.md`, `docs/adr/0001-backend-architecture.md`, `docs/adr/0002-supabase-auth-and-rls.md`.

Use this skill for `amplify/backend.ts`, `amplify/functions/*/resource.ts`, IAM policies, environment variables, storage, or deployment wiring.

## Project rules

- Amplify Gen 2 + CDK define the backend. Keep the Lambda-per-domain architecture: `transcript`, `aggregateSession`, `deleteAccount`.
- Do not merge functions or add a new function without a concrete scaling, permission, or timeout reason and an ADR.
- `amplify/backend.ts` owns routes, IAM, and environment wiring. `resource.ts` owns each function's runtime.
- Secrets stay in deployment configuration. `SUPABASE_SERVICE_ROLE_KEY` is backend-only; never expose it through `VITE_*`.
- Lambda is stateless. Do not store user data in module globals or `/tmp` beyond a single invocation.
- Check API Gateway and Lambda timeouts before adding synchronous work. Prefer the existing async/streaming path.
- `amplify_outputs.json` is generated and gitignored. The frontend loads it optionally; do not commit environment-specific outputs.
- Do not invent an Amplify or CDK command. Use the repository's existing workflow.

## Workflow

1. Read the resource, handler, and `amplify/backend.ts`.
2. Identify the IAM, env, timeout, and payload impact.
3. Make the narrowest infrastructure change.
4. Run `npm run typecheck:test` and `npm run build`.
5. If deployment synthesis is available in the environment, run the repository's existing Amplify check.
6. Update `docs/ARCHITECTURE.md` and the ADR when a boundary changes.

## Done when

- [ ] No secret is in client code or a `VITE_*` variable.
- [ ] IAM and environment changes are narrow and documented.
- [ ] The function still fits its timeout and package-size profile.
- [ ] The route wiring and handler contract still match.
- [ ] `npm run verify` passes.
