---
name: security-best-practices
description: Use for ImmiGO auth, authorization, secrets, input validation, CORS, RLS, sensitive data, logging, or vulnerability review.
---

# Security Best Practices

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/CONSTITUTION.md`, `docs/adr/0002-supabase-auth-and-rls.md`, and the touched auth/data path.

## Trust boundaries

- **Browser:** untrusted. Anything in the bundle is public.
- **API Gateway/Lambda:** validates the Supabase bearer token and scopes queries by `user_id`.
- **Supabase RLS:** the data security boundary. Authentication is not authorization.
- **Service role:** bypasses RLS. Backend-only, never in `VITE_*`, client code, logs, or tests.
- **Bedrock/Polly:** external services. Do not send secrets or unnecessary PII.

## Project rules

- Validate and constrain external input before database, filesystem, command, or third-party use.
- Enforce ownership server-side and with RLS. Never trust a client-supplied `user_id`.
- Redact tokens, credentials, raw authorization headers, transcripts, and unnecessary PII from logs and errors.
- Prefer existing Supabase/Amplify/browser security controls over custom cryptography.
- Keep CORS and headers consistent with the existing handlers.
- Add a focused negative test for the security boundary.
- Never weaken a test, policy, or auth check to make CI pass.

## Workflow

1. Identify the asset, trust boundary, attacker-controlled input, and required authorization.
2. Trace the path from input to data or external service.
3. Add a negative test that proves the boundary.
4. Fix the smallest gap.
5. Run the security-relevant tests and `npm run verify`.

## Done when

- [ ] Auth and ownership are enforced server-side.
- [ ] No secret or PII is exposed.
- [ ] Input is validated at the boundary.
- [ ] A negative test protects the boundary.
- [ ] `npm run verify` passes.
