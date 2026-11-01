---
name: debugging-root-cause
description: Use for ImmiGO failures, stack traces, broken requests, voice/transcription bugs, auth errors, or runtime errors. Finds the root cause and adds a regression test.
---

# Debugging And Root Cause

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/TESTING.md`, the feature entry in `docs/features.json`, and the nearest failing test.

## Method

1. Reproduce the failure with the narrowest command or test.
2. Locate the failing path from the error, call site, logs, and recent diff.
3. State one falsifiable hypothesis.
4. Run the cheapest check that confirms or rejects it.
5. Fix the cause, not the symptom.
6. Add a regression test that fails before the fix.
7. Run the mapped feature tests and `npm run verify`.

## Where to look

- Auth/session: bearer token, Supabase session, session replacement, RLS.
- Transcription: FSM guards, worker lifecycle, speculative/Whisper merge, audio cleanup.
- API: status code, payload shape, CORS, timeout, downstream failure.
- Reports: empty session, graded answers, Bedrock response, upsert conflict.
- UI: effect dependencies, stale closures, missing loading/error state, RTL layout.
- Data: migration missing, RLS policy, constraint, generated type drift.

## Rules

- Do not rewrite surrounding code without evidence.
- Do not add secrets, tokens, transcripts, or raw payloads to logs.
- Do not "fix" a flaky test with a longer timeout before finding the race.
- If the failure is unexplained after a reasonable check, stop and report the evidence.

## Done when

- [ ] The root cause is stated in one sentence.
- [ ] A regression test fails before the fix and passes after.
- [ ] The smallest change fixes the cause.
- [ ] `npm run verify` passes.
- [ ] Remaining uncertainty is reported.
