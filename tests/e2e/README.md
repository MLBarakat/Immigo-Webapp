# E2E Testing (Playwright) — Milestone 4

Milestones complete: 1) Skeleton, 2) Expanded coverage, 3) CI/hardening infra, 4) Production parity & hardening.

## Quick start
1. `npx playwright install chromium`
2. Run: `npx playwright test`
3. UI: `npx playwright test --ui`
4. Report: `npx playwright show-report`

## Milestone 4 additions
- **Test isolation**: `fixtures/isolation.ts` generates unique per-test users, `mockSupabaseAuthWithIsolation()`
- **Global teardown**: `global-teardown.ts` cleans temporary artifacts
- **Visual regression**: `visual-regression.spec.ts` uses `@percy/playwright` snapshots (Auth, Workspace)
- **Edge cases**: `edge-cases.spec.ts` (empty/long inputs, debounce, navigation)
- **Performance/memory**: `performance.spec.ts` (heap growth guard, LCP)
- **Retries & sharding**: configured in `playwright.config.ts` (CI 2 retries, 1 worker)

## Running modes
- PR/CI: `npx playwright test` (uses global setup for storageState, fake media, routes mocked)
- Local dev: `npx playwright test --headed`
- Nightly: GitHub Actions `e2e-nightly.yml` against staging with secrets

## Hermetic testing
Use `mockSupabaseAuth()` or `mockSupabaseAuthWithIsolation()` to run without real Supabase. Use `page.route()` to mock `/transcript`/`/complete-session`. Synthetic WAV in `assets/sample-speech.wav` + fake media flags enables real VAD/Whisper pipeline.

## CI artifacts
All runs upload `playwright-report/`, `test-results/` (includes `junit.xml`), traces/screenshots/videos on retry/failure.
