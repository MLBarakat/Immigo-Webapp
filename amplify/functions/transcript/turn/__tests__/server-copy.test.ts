// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SERVER_COPY, serverCopy, type ServerCopyKey } from '../server-copy';
import type { OnboardingLanguage } from '../mode-onboarding';
import enUS from '../../../../../src/i18n/locales/en-US/conversation.json';
import esES from '../../../../../src/i18n/locales/es-ES/conversation.json';
import frFR from '../../../../../src/i18n/locales/fr-FR/conversation.json';
import arSA from '../../../../../src/i18n/locales/ar-SA/conversation.json';

const languages: OnboardingLanguage[] = ['en-US', 'es-ES', 'fr-FR', 'ar-SA'];

describe('server copy catalog (F5 typed catalog with safeReplyKey)', () => {
  it('has every ServerCopyKey present in all four supported locales', () => {
    const keys: ServerCopyKey[] = Object.keys(SERVER_COPY) as ServerCopyKey[];
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      for (const language of languages) {
        expect(SERVER_COPY[key][language]).toBeDefined();
        expect(typeof SERVER_COPY[key][language]).toBe('string');
        expect(SERVER_COPY[key][language].length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the conversation "server" namespace key-for-key identical across locale files', () => {
    const expected = Object.keys(enUS.server).sort();
    expect(expected.length).toBeGreaterThan(0);

    for (const catalog of [esES.server, frFR.server, arSA.server]) {
      expect(Object.keys(catalog).sort()).toEqual(expected);
    }
  });

  it('resolves a localized copy string by key and language', () => {
    expect(serverCopy('legalAdvice', 'en-US')).toContain('legal advice');
    expect(serverCopy('legalAdvice', 'es-ES')).toContain('asesoramiento legal');
    expect(serverCopy('legalAdvice', 'fr-FR')).toContain('conseil juridique');
    expect(serverCopy('legalAdvice', 'ar-SA')).toMatch(/مشورة قانونية/);
  });

  it('keeps every key string non-empty and distinct per locale where meaningful', () => {
    const keys: ServerCopyKey[] = Object.keys(SERVER_COPY) as ServerCopyKey[];
    const nonEnglish = languages.filter((lng) => lng !== 'en-US');
    for (const key of keys) {
      // No locale should fall back to English for any key.
      for (const lng of nonEnglish) {
        expect(SERVER_COPY[key][lng]).not.toBe(SERVER_COPY[key]['en-US']);
      }
    }
  });
});
