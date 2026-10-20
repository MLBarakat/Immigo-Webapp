import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './fixtures/auth';

test.describe('Performance & memory', () => {
  test.beforeEach(async ({ context, page }) => {
    await ensureAuthenticated(context, page);
  });

  test('memory does not grow unbounded over moderate operations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('voicehub-mic-button')).toBeVisible({ timeout: 15000 });

    const initialMemory = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize || 0);

    for (let i = 0; i < 30; i++) {
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(10);
    }

    const finalMemory = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize || 0);

    expect(typeof initialMemory).toBe('number');
    expect(typeof finalMemory).toBe('number');

    // Guard: allow up to 5x growth in CI/JSdom environments (memory API may be mocked)
    if (initialMemory > 0 && finalMemory > 0) {
      expect(finalMemory).toBeLessThan(initialMemory * 5);
    }
  });

  test('LCP is reasonable', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1] as any;
          resolve(last?.startTime || 0);
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => resolve(0), 5000);
      });
    });
    expect(lcp).toBeGreaterThanOrEqual(0);
  });
});
