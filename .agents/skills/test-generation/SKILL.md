---
name: test-generation
description: Use for ImmiGO unit, component, contract, integration, regression, or E2E tests. Produces tests that exercise production code and fail for the right reason.
---

# Test Generation

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/TESTING.md`, the feature entry in `docs/features.json`, and nearby tests.

## Project rules

- Tests must exercise production code. Never re-implement the reducer, parser, matcher, policy, or service in the test.
- Match the repository's setup, naming, and location.
- Cover the requested behavior and its highest-risk boundaries: validation, auth, errors, cleanup, persistence, ordering, loading, and retry.
- Mock external services and time only at the boundary. Keep tests deterministic. No real network calls in unit tests.
- Use Arrange/Act/Assert and behavior-focused names.
- Do not test framework internals or private implementation details when a contract-level assertion is available.
- Do not use snapshot tests as a substitute for behavioral assertions.
- No new unexplained skips. Use `// ALLOW_SKIP: <reason and how to run it>`.
- No new `any`, `@ts-ignore`, or weakened assertions.

## Levels

- Unit: pure logic, reducers, parsers, policies.
- Component: user-visible rendering and interaction.
- Contract: Lambda status codes, payloads, auth, downstream failure.
- Integration: migrations, RLS assumptions, cross-module wiring.
- E2E: browser flows, layout, voice lifecycle, network failure.

## Workflow

1. Write the failing test and show the failure.
2. Make the smallest production change.
3. Run the focused test.
4. Run the mapped feature tests.
5. Run `npm run verify`.

## Done when

- [ ] The test failed before the change for the right reason.
- [ ] It imports and exercises production code.
- [ ] It asserts behavior, not a copied implementation.
- [ ] It is deterministic and isolated.
- [ ] No skip or weakened assertion was added.
- [ ] `npm run verify` passes.
