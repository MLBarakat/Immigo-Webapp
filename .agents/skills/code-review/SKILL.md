---
name: code-review
description: Use for ImmiGO code review, PR feedback, second-model review, or maintainability assessment. Produces severity-ordered findings with file references and test-gap analysis.
---

# Code Review

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/CONSTITUTION.md`, `docs/features.json`, `docs/REVIEW_CHECKLIST.md`.

Use this skill when reviewing a diff, a pull request, or another model's patch.

## Review order

1. **Protected behavior.** Does the change alter a feature marked `protected` without a spec delta and approval?
2. **Security.** Auth, RLS, ownership, secrets, input validation, log redaction, safe errors.
3. **Contracts.** API shapes, status codes, schema, migrations, generated types.
4. **Tests.** Does the test exercise production code? Did it fail before? Was a test deleted, skipped, or weakened?
5. **Correctness.** Async/error paths, cleanup, ordering, pagination, idempotency.
6. **Frontend.** Effect dependencies, state mutation, loading/error/retry states, accessibility, RTL.
7. **Performance and maintainability.** Only with concrete impact.
8. **Docs and registry.** Feature entry, architecture, ADR, README, change receipt.

## Output rules

- Findings first, ordered by severity. Include a file path, the concrete impact, and a focused fix.
- Do not flag missing context in a partial snippet as a defect.
- Do not demand abstractions, memoization, or a new dependency without a measurable reason.
- Mention test gaps and residual risk after the findings.
- If there are no findings, say so plainly.

## Second-model review

Use the prompt in `docs/REVIEW_CHECKLIST.md` section 10. A second model may prepare findings but may not approve a protected change.

## Done when

- [ ] Every finding has a file reference and impact.
- [ ] Protected behavior, auth, secrets, contracts, and tests were checked.
- [ ] Test gaps and residual risk are stated.
- [ ] The review does not invent issues from missing context.
