# Historical Archive

**Do not follow anything in this directory.**

This directory contains superseded plans, audits, and source packs kept for traceability. They may describe architecture that no longer exists, features that were never built, or remediation work that was completed differently.

The current sources of truth are:

- `AGENTS.md` — working contract.
- `docs/CONSTITUTION.md` — invariants.
- `docs/ARCHITECTURE.md` — actual runtime architecture.
- `docs/FEATURES.md` and `docs/features.json` — protected behavior.
- `docs/TESTING.md` — test policy.
- `docs/CHANGE_POLICY.md` — change rules.
- `docs/MIGRATIONS.md` — schema and RLS process.
- `docs/adr/` — accepted decisions.

## Contents

| File | Why it is archived |
|---|---|
| `REMEDIATION_PLAN.md` | Describes an Express/serverless-http refactor that was never implemented. The actual backend uses raw API Gateway handlers. |
| `REMEDIATION_AUDIT.md` | Claims the Express refactor was completed. It was not. The claims are false and would mislead a model. |

If a historical document contains a useful idea, re-evaluate it against the current architecture and write a new proposal. Do not copy it forward.
