---
name: refactoring
description: Use when simplifying, extracting, reorganizing, or improving ImmiGO maintainability without a requested behavior change. Requires characterization tests first.
---

# Refactoring

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/TESTING.md`, the feature entry, and the tests that protect the code.

## Project rules

- Define the behavior that must remain unchanged before editing.
- Characterization tests come first, especially for `amplify/functions/transcript/handler.ts` and the transcription reducer.
- Prefer small, local changes: guard clauses, clear names, and extraction only when it improves testability or removes real duplication.
- Preserve public inputs, outputs, status codes, side effects, auth, logs, and error behavior.
- Follow local module boundaries. Do not create shared abstractions or merge domains prematurely.
- Do not do a drive-by rename, formatting sweep, or dependency upgrade.
- A refactor that changes behavior is not a refactor; split it into a feature change with a spec.

## Workflow

1. Capture the current behavior with tests.
2. Run them and show they pass.
3. Refactor one coherent slice.
4. Re-run the same tests after each slice.
5. Run `npm run verify`.
6. If behavior changed, stop and follow the feature-contract process.

## Done when

- [ ] Characterization tests existed before the refactor.
- [ ] Behavior and contracts are unchanged.
- [ ] The change is local and reviewable.
- [ ] No unrelated edits are included.
- [ ] `npm run verify` passes.
