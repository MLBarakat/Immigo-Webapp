// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { buildWelcomeBannerPrompt, TurnInterpreterAdapter, type ModelComplete } from '../turn-interpreter';
import type { WelcomeBannerContext } from '../types';

describe('buildWelcomeBannerPrompt — two cases only, text-only (no TTS hygiene)', () => {
  it('new-user case: no stats needed, instructs purpose + encouragement', () => {
    const ctx: WelcomeBannerContext = { isNewUser: true };
    const { system, user } = buildWelcomeBannerPrompt(ctx);
    expect(system.toLowerCase()).toContain('new user');
    expect(system.toLowerCase()).toContain('purpose');
    expect(user).toContain('NEW USER');
    // Never spoken — must NOT carry the spoken-audio hygiene rules.
    expect(system).not.toContain('Polly');
    expect(system).not.toContain('parenthetical math');
  });

  it('returning-user case: includes lifetime stats and recently-missed questions', () => {
    const ctx: WelcomeBannerContext = {
      isNewUser: false,
      lifetimeStats: { answered: 42, correct: 30, accuracyPct: 71, recentlyMissedQuestions: ['Name one power of the U.S. Congress.'] },
    };
    const { system, user } = buildWelcomeBannerPrompt(ctx);
    expect(system.toLowerCase()).toContain('returning user');
    expect(user).toContain('42 questions answered');
    expect(user).toContain('71% accuracy');
    expect(user).toContain('Name one power of the U.S. Congress.');
  });

  it('returning user with no missed questions on file still produces a valid prompt', () => {
    const ctx: WelcomeBannerContext = { isNewUser: false, lifetimeStats: { answered: 5, correct: 5, accuracyPct: 100, recentlyMissedQuestions: [] } };
    const { user } = buildWelcomeBannerPrompt(ctx);
    expect(user).toContain('No specific recently-missed questions on file.');
  });
});

describe('generateWelcomeBanner — robust fallback, never empty', () => {
  it('returns the model text when the call succeeds', async () => {
    const complete: ModelComplete = vi.fn(async () => 'Welcome! Ready to begin?');
    const adapter = new TurnInterpreterAdapter(complete);
    expect(await adapter.generateWelcomeBanner({ isNewUser: true })).toBe('Welcome! Ready to begin?');
  });

  it('falls back to a non-empty NEW USER message when the model call throws', async () => {
    const complete: ModelComplete = vi.fn(async () => { throw new Error('fail'); });
    const adapter = new TurnInterpreterAdapter(complete);
    const text = await adapter.generateWelcomeBanner({ isNewUser: true });
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain('welcome');
  });

  it('falls back to a non-empty RETURNING USER message referencing real stats when the model call throws', async () => {
    const complete: ModelComplete = vi.fn(async () => { throw new Error('fail'); });
    const adapter = new TurnInterpreterAdapter(complete);
    const text = await adapter.generateWelcomeBanner({
      isNewUser: false,
      lifetimeStats: { answered: 10, correct: 8, accuracyPct: 80, recentlyMissedQuestions: [] },
    });
    expect(text).toContain('10 question');
    expect(text).toContain('80%');
  });
});
