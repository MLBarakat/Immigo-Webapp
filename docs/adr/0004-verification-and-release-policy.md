# ADR 0004 — Verification Gate And Feature Contracts

- **Status:** Accepted
- **Date:** 2026-10-31
- **Deciders:** ImmiGO maintainers

## Context

AI coding tools can produce plausible changes that silently regress behavior. The repository had:

- No required lint/typecheck/unit/build CI gate.
- E2E workflows with `|| true`, `continue-on-error`, and a placeholder user setup.
- A unit test that re-implemented the production reducer instead of importing it.
- Backend handlers without direct contract tests.
- Documentation that contradicted the code.

## Decision

Adopt a single local gate and a machine-readable feature registry:

- `npm run verify` runs governance, lint, typecheck, unit/integration with coverage, and build.
- `docs/features.json` maps every active or protected feature to entry points, invariants, and tests.
- `npm run verify:governance` rejects registry drift, unexplained skips, and agent-doc drift.
- CI runs the same gate and may not swallow failures.
- Tests must exercise production code. Re-implementing production logic in a test is prohibited.

## Consequences

- A change that breaks a protected feature fails the gate.
- A new feature without a registry entry and a test fails the gate.
- A model may rewrite an implementation but may not silently change a contract.
- Coverage becomes a ratchet; thresholds may rise but not fall without approval.
- The gate is slower than lint alone. That cost is accepted because it replaces manual vigilance.

## Enforcement

- `AGENTS.md` defines the workflow and change receipt.
- `docs/TESTING.md` defines test levels and skip rules.
- `docs/CHANGE_POLICY.md` defines protected paths and approvals.
- `.github/workflows/verify.yml` runs the gate.
