---
name: pattern-based-generation
description: Use when scaffolding a new ImmiGO feature, endpoint, domain, component, hook, test, or repeated structure. Copies the closest working pattern instead of inventing one.
---

# Pattern-Based Generation

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, and the closest existing implementation.

## Method

1. Find the closest working implementation in the same layer.
2. Read its file layout, naming, imports, registration path, error handling, and tests.
3. Decide whether the change belongs in an existing domain or needs a new one. Do not assume one Lambda per route or one component per feature.
4. Generate only the files the request needs. Keep placeholders explicit.
5. Never invent business rules, schemas, env vars, API shapes, or auth behavior.
6. Preserve the reference implementation's auth, validation, logging, and configuration conventions.
7. Add a focused test and a feature registry entry.

## Common patterns

- New API behavior: extend an existing Lambda handler and `ApiClient`, not a new framework.
- New UI state: use the existing context/hook pattern; do not add a state library.
- New data: add a migration, RLS policy, and generated types.
- New test: match the nearest `__tests__` layout and setup.
- New skill: add YAML frontmatter, `AGENTS.md` pointer, project rules, and `## Done when`.

## Done when

- [ ] The new code follows a real, cited pattern.
- [ ] No invented contract or schema.
- [ ] Auth, validation, logging, and cleanup match the reference.
- [ ] A focused test exists.
- [ ] The feature registry is updated.
- [ ] `npm run verify` passes.
