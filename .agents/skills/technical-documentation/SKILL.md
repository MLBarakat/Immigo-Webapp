---
name: technical-documentation
description: Use for ImmiGO README content, API docs, architecture notes, TSDoc, ADRs, runbooks, or data-flow documentation.
---

# Technical Documentation

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, and the source/tests that define the behavior.

## Project rules

- Document facts confirmed by source, types, tests, and configuration. Do not document intentions.
- State scope, prerequisites, commands, inputs, outputs, auth, errors, side effects, and boundaries where relevant.
- Keep the canonical sources consistent:
  - `AGENTS.md` for the working contract.
  - `docs/CONSTITUTION.md` for invariants.
  - `docs/ARCHITECTURE.md` for runtime boundaries.
  - `docs/FEATURES.md` / `docs/features.json` for behavior.
  - `docs/adr/` for decisions.
  - `README.md` for setup and commands.
- Do not claim Amplify Auth is the auth provider. Supabase Auth is.
- Do not claim Express or `serverless-http`. The handlers are raw API Gateway handlers.
- Do not invent fields, endpoints, status codes, env vars, or infrastructure.
- Mark unknowns or ask for the missing contract.
- Keep docs synchronized with the smallest relevant source change.
- Avoid comments that merely restate code.

## Workflow

1. Read the source, tests, and config.
2. Identify the audience and the decision the document supports.
3. Prefer short headings, tables, examples, and steps.
4. Update the registry or ADR when behavior or architecture changed.
5. Check links and commands.

## Done when

- [ ] Every claim is grounded in source or tests.
- [ ] Commands are real and current.
- [ ] No stale architecture claim remains.
- [ ] The registry/ADR/README is updated where needed.
- [ ] Links and paths resolve.
