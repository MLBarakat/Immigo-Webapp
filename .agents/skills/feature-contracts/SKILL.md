---
name: feature-contracts
description: Use when adding a feature, changing protected behavior, updating docs/features.json, or deciding whether a change needs a spec delta and approval.
---

# Feature Contracts

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/CONSTITUTION.md` section 4, `docs/FEATURES.md`, `docs/features.json`, `docs/CHANGE_POLICY.md`.

Use this skill before changing any behavior that a user or another system depends on.

## The contract

A feature entry has:

- `id` — `F-01` style.
- `title` and `summary` — what the feature is.
- `status` — `protected`, `active`, `experimental`, or `deprecated`.
- `entryPoints` — the files that own the behavior.
- `tests` — the executable protection.
- `invariants` — what must remain true.

## Rules

- Every active or protected feature has at least one test.
- A protected change requires a spec delta, a failing test, explicit human approval, and a test update in the same change.
- A new feature needs a registry entry, a test, and an update to `docs/FEATURES.md`.
- Do not change a test expectation to match new behavior without updating the contract.
- Do not mark a feature `protected` if it has no test.
- Do not delete a feature entry without an ADR and approval.
- Keep `docs/FEATURES.md` and `docs/features.json` in sync.

## Workflow

1. Find or create the feature ID.
2. Read its invariants and test map.
3. Write the spec delta in the pull request.
4. Add the failing test.
5. Change the code.
6. Update the registry and tests.
7. Run `npm run verify:governance` and `npm run verify`.

## Done when

- [ ] The feature ID exists in both registries.
- [ ] Invariants and entry points are accurate.
- [ ] At least one mapped test protects the behavior.
- [ ] Protected changes have approval and a spec delta.
- [ ] `npm run verify` passes.
