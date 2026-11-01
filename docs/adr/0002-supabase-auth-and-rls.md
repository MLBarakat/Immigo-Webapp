# ADR 0002 — Supabase Auth, Postgres, And RLS; Amplify For Backend Hosting

- **Status:** Accepted
- **Date:** 2026-10-31
- **Deciders:** ImmiGO maintainers

## Context

The repository uses two platforms:

- **Supabase** for authentication, Postgres, Realtime, and RLS.
- **AWS Amplify Gen 2** for backend hosting, API Gateway, Lambda, and storage.

Some documentation claimed Amplify Auth was the authentication provider. The code uses Supabase Auth in `src/context/AuthContext.tsx` and `src/supabaseClient.ts`. An Amplify auth resource exists in `amplify/auth/resource.ts`, but it is not the user authentication path.

## Decision

Supabase Auth is the only user authentication provider. Supabase Postgres with RLS is the data security boundary. Amplify provides backend hosting, API Gateway, Lambda, and storage.

## Consequences

- The frontend obtains a Supabase session and sends its bearer token to the API.
- Every protected Lambda validates the token with Supabase before doing work.
- RLS policies, not client checks, enforce ownership.
- The Amplify auth resource must not be presented as the auth provider. It may be removed in a future migration after checking for deployment dependencies.
- A future migration to another auth provider requires a new ADR, a migration plan, and a security review.

## Enforcement

- `docs/CONSTITUTION.md` records the invariant.
- `docs/ARCHITECTURE.md` describes the runtime path.
- Auth and RLS tests protect the boundary.
- `README.md` must not claim Amplify Auth is used for user authentication.
