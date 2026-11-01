/**
 * Playwright-facing configuration entry point.
 *
 * E2E fixtures import `../config` relative to `tests/e2e`, while the shared
 * test configuration lives in `tests/config`. Re-export it here so both
 * suites read the same values and there is only one source of truth.
 */
export { E2E_CONFIG } from '../config';
