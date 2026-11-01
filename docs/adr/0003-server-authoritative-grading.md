# ADR 0003 — Civics Grading Is Server-Authoritative

- **Status:** Accepted
- **Date:** 2026-10-31
- **Deciders:** ImmiGO maintainers

## Context

Civics grading drives user feedback, progress reports, and mock-exam review. A client-side or model-only decision would be easy to manipulate, inconsistent across devices, and impossible to audit.

## Decision

Civics answers are graded on the server by the transcript domain. The client never decides correctness. Recorded verdicts in `graded_answers` are the authoritative source for progress reports.

The turn policy distinguishes:

- Correct, partial, and incorrect answers.
- Confirmations.
- Hints.
- Repeats.
- Progress questions.
- Questions that require a current answer and remain ungraded until an authoritative answer exists.

## Consequences

- Grading changes require a prompt/eval change and a deterministic policy test.
- The client may render a verdict but may not compute or override one.
- The aggregation Lambda may use model-generated prose for qualitative feedback, but it must not override recorded counts or verdicts.
- A model change requires an eval run and a review of the failure cases.

## Enforcement

- `amplify/functions/transcript/turn/__tests__/` protects turn policy and matching.
- `eval/civics/__tests__/civics-eval.test.ts` protects grading quality.
- `amplify/functions/aggregateSession/__tests__/handler.test.ts` protects authoritative score facts.
- `docs/FEATURES.md` F-05 and F-06 record the invariants.
