---
name: typescript-strict
description: Use for ImmiGO type errors, interfaces, generics, unsafe values, external data boundaries, or TypeScript design.
---

# TypeScript Strictness

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `tsconfig.json`, `tsconfig.test.json`, and the actual library types.

## Project rules

- Type external data as `unknown`, validate or narrow it, and model nullable/optional values honestly.
- Avoid `any`, `@ts-ignore`, `@ts-expect-error` used to hide a real failure, and non-null assertions.
- Use a small type guard when structural validation is required.
- Keep types near their owner unless they are genuinely shared.
- Preserve runtime validation. TypeScript alone does not validate input.
- Do not change runtime behavior merely to silence the compiler.
- Do not use a cast to bridge a schema or contract mismatch. Fix the schema or the mapping.
- Use the existing shared types (`src/types/`, `src/context/conversationContextTypes.ts`, `src/services/apiClient.ts`).

## Workflow

1. Read the actual library and local types.
2. Reproduce the error with the narrowest typecheck.
3. Narrow the type or fix the mapping.
4. Run `npm run typecheck:test` and `npm run build`.
5. If a public type changed, update its consumers and tests.

## Done when

- [ ] No new `any` or suppression was added.
- [ ] Nullable and optional values are modeled honestly.
- [ ] External input is narrowed at the boundary.
- [ ] Runtime behavior is unchanged unless intended.
- [ ] `npm run typecheck:test` and `npm run build` pass.
