---
name: release-verification
description: Use when preparing a merge, release, deployment, or handoff. Runs the full verification gate, checks coverage and CI honesty, confirms a clean build, and produces the change receipt.
---

# Release Verification

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/TESTING.md`, `docs/CHANGE_POLICY.md`, `docs/REVIEW_CHECKLIST.md`, and the feature entry you changed.

Use this skill before asking for review, merging, deploying, or handing work to another model.

## The gate

Run the same gate CI runs. Do not substitute a subset.

```bash
npm run verify
```

It must execute, in order:

1. `verify:governance` — feature registry, skipped tests, agent docs, workflow honesty.
2. `lint` — warnings are errors.
3. `typecheck:test` — source, tests, and function tests.
4. `test:coverage` — unit and integration tests with thresholds.
5. `build` — TypeScript declaration build and Vite production build.

If a step is missing or silently swallowed, fix the gate before trusting a green result.

## Additional checks by change type

| Change | Also run |
|---|---|
| Browser flow, layout, voice lifecycle | `npm run test:e2e` (or the focused spec) |
| Civics grading, prompt, matching, model | `npm run eval:civics` |
| API contract | The mapped handler contract tests |
| Migration or RLS | `supabase db reset` plus the migration/RLS tests |
| Deployment wiring | The repository's existing Amplify deployment check |

## Build-safety checks

- A fresh clone has no `amplify_outputs.json`. Confirm `npm run build` still succeeds without it.
- Confirm no secret, token, service-role key, or real transcript is present in the diff.
- Confirm no generated artifact, coverage output, or local environment file is staged.
- Confirm the lockfile changed only if a dependency changed.

## Evidence to collect

- The exact commands run and their results.
- The failing test that preceded the fix and its failure message.
- Coverage numbers before and after, if the change affects them.
- Any skipped or quarantined test with its `ALLOW_SKIP` reason and owner.
- Residual risk and the rollback plan.

## Red flags

- `|| true`, `continue-on-error`, or a swallowed setup failure in CI.
- A test deleted, renamed, skipped, or weakened to get green.
- A threshold lowered without approval.
- A "temporary" workaround with no owner or issue.
- A green local run that used a different command than CI.

## Done when

- [ ] `npm run verify` passes locally with no bypass.
- [ ] The relevant E2E or eval command passes when the change requires it.
- [ ] The build works without generated environment files.
- [ ] Coverage did not decrease without approval.
- [ ] No secret or generated artifact is in the diff.
- [ ] The change receipt from `AGENTS.md` is complete.
- [ ] The rollback plan is stated.
