# ImmiGO Review Checklist

**Version:** 1.0.0  
**Updated:** 2026-10-31

Use this checklist for human review and for a second-model review. Findings come first, ordered by severity, with file references and concrete impact.

## 1. Contract and scope

- [ ] The feature ID is present and exists in `docs/features.json`.
- [ ] The change does one thing and does not include drive-by edits.
- [ ] The behavior change is described in the spec delta.
- [ ] Protected behavior has explicit approval.
- [ ] No public API, schema, or auth change is hidden inside a refactor.

## 2. Tests

- [ ] A test failed before the change for the right reason.
- [ ] The test exercises production code, not a copy of it.
- [ ] The mapped feature tests still pass.
- [ ] Success, validation, auth, downstream failure, and cleanup paths are covered where relevant.
- [ ] No test was deleted, skipped, renamed, or weakened to make CI pass.
- [ ] No new unexplained `ALLOW_SKIP`.
- [ ] Coverage did not decrease without approval.
- [ ] `npm run verify` passes.

## 3. Security and privacy

- [ ] Authentication is validated server-side.
- [ ] Authorization and ownership are enforced by RLS and user-scoped queries.
- [ ] No secret, token, service-role key, or PII enters client code, logs, tests, or commits.
- [ ] External input is validated at the boundary.
- [ ] Error responses do not leak stack traces or secrets.
- [ ] Logs include useful correlation context but not raw payloads.

## 4. Data and persistence

- [ ] Migrations are expand/contract and RLS-protected.
- [ ] User-owned tables have owner-scoped policies and no unconditional or anon-targeted policy.
- [ ] Public functions deny anon EXECUTE; `SECURITY DEFINER` functions pin `search_path`.
- [ ] `auth.users` foreign keys cascade on delete.
- [ ] Generated types and `docs/DATABASE.md` match the schema.
- [ ] `npm run db:verify` and `npm run docs:db:check` pass.
- [ ] Ordering, pagination, and uniqueness are preserved.
- [ ] A rollback plan exists for destructive or irreversible changes.
- [ ] No user data is cached in shared Lambda state.

## 5. Frontend and UX

- [ ] Loading, empty, error, retry, and unavailable states are handled.
- [ ] Effects clean up subscriptions, timers, workers, and audio nodes.
- [ ] State updates are immutable and dependencies are complete.
- [ ] No unnecessary memoization or global state was added.
- [ ] The change works on mobile and desktop.

## 6. Accessibility and i18n

- [ ] Controls are semantic and labelled.
- [ ] Keyboard access, focus order, focus trap, and visible focus are preserved.
- [ ] Touch targets are usable.
- [ ] Reduced-motion behavior is respected.
- [ ] User-facing strings live in locale files.
- [ ] Arabic RTL layout still works.
- [ ] Color contrast and zoom/reflow are not degraded.

## 7. Backend and infrastructure

- [ ] The handler remains a raw API Gateway handler.
- [ ] Lambda-per-domain architecture is preserved.
- [ ] Timeouts, payload size, memory, and cold-start impact are considered.
- [ ] IAM and environment changes are narrow.
- [ ] No Express, serverless-http, or new framework was introduced.

## 8. Performance

- [ ] The change is tied to measured or clearly identified cost.
- [ ] No new waterfall, render loop, or large import was added without evidence.
- [ ] Bundle and Lambda package size impact is acceptable.
- [ ] Caches are not shared across users.

## 9. Documentation

- [ ] `docs/FEATURES.md` and `docs/features.json` are updated when behavior changes.
- [ ] `docs/ARCHITECTURE.md` is updated when boundaries change.
- [ ] An ADR exists for an architecture decision.
- [ ] `README.md` remains accurate.
- [ ] The change receipt is complete.

## 10. Second-model review prompt

Use this prompt with a different model when the change is protected or security-relevant:

```text
You are reviewing a change to ImmiGO. Read AGENTS.md, docs/CONSTITUTION.md,
docs/features.json, and the mapped tests before reviewing.

Report findings first, ordered by severity, with file references and concrete
impact. Check:
1. Does the change alter a protected behavior without a spec delta and approval?
2. Does the test exercise production code, or does it re-implement it?
3. Is auth/authorization enforced server-side and by RLS?
4. Are secrets, tokens, transcripts, or PII exposed?
5. Are error, cleanup, loading, and retry paths correct?
6. Are i18n/RTL, accessibility, and responsive behavior preserved?
7. Is the API/schema contract changed without tests and migration notes?
8. Is there a drive-by refactor, new dependency, or unexplained skip?
9. Does `npm run verify` pass?
10. What is the highest residual risk?

If there are no findings, say so plainly. Do not invent issues from missing context.
```

## 11. Approval

- A protected change needs a human approver who is not the author.
- A schema, auth, or API contract change needs the owner of that area.
- An AI agent may prepare the change and the evidence but may not grant approval.
