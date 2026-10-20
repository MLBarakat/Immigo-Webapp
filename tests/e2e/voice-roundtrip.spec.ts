import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './fixtures/auth';
import { mockTranscriptEndpoint, mockCompleteSession } from './fixtures/network';
import { installSyntheticSpeech } from './fixtures/audio';

test.describe('Voice conversation roundtrip', () => {
  test.beforeEach(async ({ context, page }) => {
    await installSyntheticSpeech(page);
    await ensureAuthenticated(context, page);
  });

  test('starts voice session and renders assistant response', async ({ page }) => {
    await mockTranscriptEndpoint(page, {
      responseText: 'I heard you. Here is your response.',
      audioBase64: '',
      verdict: null,
      needsConfirmation: false,
      nextItemId: null,
      nextQuestion: null,
    });
    await mockCompleteSession(page);

    // Tap mic/start
    const micButton = page.getByTestId('voicehub-mic-button');
    await expect(micButton).toBeVisible({ timeout: 15000 });
    await micButton.click();

    // If consent modal appears, accept it
    const consentAccept = page.getByTestId('mic-consent-accept');
    if (await consentAccept.isVisible({ timeout: 3000 }).catch(() => false)) {
      await consentAccept.click();
    }

    // Wait for assistant response in history
    const log = page.getByTestId('conversation-history-log');
    await expect(log).toContainText('I heard you.', { timeout: 60000 });
  });
});
