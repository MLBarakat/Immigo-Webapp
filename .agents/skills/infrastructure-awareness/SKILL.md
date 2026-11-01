---
name: infrastructure-awareness
description: Use when discussing ImmiGO latency, limits, concurrency, deployment topology, cold starts, API Gateway, Lambda, Supabase, or browser runtime behavior.
---

# Infrastructure Awareness

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/ARCHITECTURE.md`, `docs/adr/0001-backend-architecture.md`.

## Project rules

- Identify the execution context before giving advice: browser, API Gateway, Lambda, Supabase, Bedrock, Polly, or storage.
- Check hard limits before recommending synchronous work:
  - `transcript` Lambda: 60s.
  - `aggregateSession` Lambda: 120s.
  - API Gateway payload and throttling limits.
  - Lambda memory, package size, and cold-start cost.
  - Supabase connection lifetime and RLS query cost.
- Lambda is stateless. Global state and `/tmp` are per-invocation optimizations, not storage.
- Do not cache user-specific data in shared Lambda state.
- Prefer the existing async, streaming, and external-storage patterns.
- Separate measured bottlenecks from general advice. Ask for duration, traffic, payload size, or traces only when needed.
- Do not introduce a new service, queue, cache, or worker without an ADR and approval.

## Workflow

1. State the execution context and the limit that matters.
2. Identify the measured or expected cost.
3. Propose the smallest change that respects the limit.
4. Validate with a benchmark, test, or build measurement.
5. Update the architecture doc or ADR if the boundary changes.

## Done when

- [ ] The execution context and limit are explicit.
- [ ] The recommendation is tied to evidence, not folklore.
- [ ] No user data is shared across invocations.
- [ ] The existing infrastructure pattern is preserved.
- [ ] The impact is documented.
