---
name: performance-optimization
description: Use when ImmiGO has latency, slow startup, render lag, bundle cost, Lambda cold-start, or unnecessary work. Requires evidence before changing code.
---

# Performance Optimization

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/ARCHITECTURE.md`, the feature entry, and any existing benchmark or test.

## Project rules

- Measure or identify the bottleneck before changing code.
- Keep the optimization tied to evidence. "This might be faster" is not evidence.
- Frontend: inspect network waterfalls, expensive renders, large imports, effect loops, and unnecessary state updates.
- Backend: inspect cold-start work, sequential independent I/O, payload size, external calls, and Lambda limits.
- Do not add workers, caches, memoization, or infrastructure without a demonstrated need.
- Do not cache user-specific data in shared Lambda state.
- Preserve security, error handling, accessibility, and observability.
- Do not trade correctness for a micro-optimization.

## Workflow

1. Capture a baseline: timing, bundle size, memory, or request count.
2. Identify the dominant cost.
3. Make one targeted change.
4. Re-measure with the same method.
5. Add or update a test/benchmark that would catch a regression.
6. Run `npm run verify`.

## Done when

- [ ] A baseline and post-change measurement exist.
- [ ] The change targets the measured bottleneck.
- [ ] Behavior, security, and accessibility are preserved.
- [ ] A regression guard exists where practical.
- [ ] `npm run verify` passes.
