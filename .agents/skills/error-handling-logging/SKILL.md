---
name: error-handling-logging
description: Use when adding or changing ImmiGO error handling, API failure responses, diagnostics, correlation IDs, or log content.
---

# Error Handling And Logging

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `src/logger.ts`, the touched handler or service, and the relevant feature entry.

## Project rules

- Use the existing `logger` in frontend code and the existing `console` contract in Lambda handlers. Do not invent a new logging abstraction.
- Include useful context: operation, correlation/trace ID, resource ID, status.
- Exclude credentials, tokens, raw authorization headers, transcripts, and unnecessary PII.
- Distinguish expected validation/auth failures from unexpected failures. Preserve the module's response semantics.
- Do not swallow errors. Clean up in `finally` when needed and preserve rejected promises.
- API errors should remain typed (`ApiError`) and user-visible where the UI has an error state.
- Lambda errors must return a safe message, not a stack trace.

## Workflow

1. Read the existing error contract and tests.
2. Identify the failure classes and the correct status/response for each.
3. Add a focused test for the expected error, unexpected error, and cleanup path.
4. Change the smallest part of the error path.
5. Verify no secret or raw payload enters the log.

## Done when

- [ ] Expected and unexpected failures are distinguishable.
- [ ] Logs have correlation context but no secrets or raw payloads.
- [ ] Errors are not swallowed.
- [ ] Cleanup runs on failure.
- [ ] Tests cover the failure and cleanup paths.
- [ ] `npm run verify` passes.
