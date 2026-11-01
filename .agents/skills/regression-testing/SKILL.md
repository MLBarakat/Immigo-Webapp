---
name: regression-testing
description: Use when fixing a bug or protecting legacy ImmiGO behavior. Reproduces the failure, adds a failing regression test, fixes the cause, and prevents recurrence.
---

# Regression Testing

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/TESTING.md`, the feature entry, and the nearest failing test.

## Method

1. Reproduce the bug with the narrowest command.
2. Identify the feature ID and the behavior that broke.
3. Write a regression test that fails for the right reason.
4. Confirm the failure is the bug, not a test setup error.
5. Fix the root cause.
6. Run the regression test and the mapped feature tests.
7. Run `npm run verify`.

## Rules

- The test must exercise production code.
- The test must fail before the fix and pass after.
- Do not weaken an existing test to make the new behavior pass.
- Do not copy the buggy implementation into the test.
- For legacy code without tests, add characterization tests before refactoring.
- For `amplify/functions/transcript/handler.ts`, protect the request/response boundary before touching internals.
- A flaky test is a defect; fix the race, do not add retries.

## Good regression targets

- FSM transition that stranded a session.
- Speculative/Whisper merge that dropped or duplicated text.
- Auth or RLS boundary that allowed cross-user access.
- Pagination that dropped or duplicated messages.
- Report aggregation that overrode recorded verdicts.
- Settings that failed to persist.

## Done when

- [ ] The regression test failed before the fix.
- [ ] The fix addresses the cause, not the symptom.
- [ ] The mapped feature tests pass.
- [ ] No existing test was weakened.
- [ ] `npm run verify` passes.
