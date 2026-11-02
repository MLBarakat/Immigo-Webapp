import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UserSettingsService, userSettingsRowToSettings } from '../userSettingsService';
import { DEFAULT_USER_SETTINGS } from '../../types/settings';

describe('UserSettingsService durable learning goals', () => {
  it('maps saved learning goals and weekly targets from the database row', () => {
    const settings = userSettingsRowToSettings({
      user_id: 'user-1',
      language: 'en-US',
      theme: 'light',
      ai_voice_id: 'Joanna',
      live_feedback_enabled: true,
      mic_mode: 'voice_activity',
      barge_in: 'balanced',
      progress_report_frequency: 'weekly',
      font_size: 'default',
      has_seen_welcome: false,
      mic_consent_version: null,
      notifications_enabled: false,
      reminder_time: '19:00',
      input_device_id: null,
      output_device_id: null,
      learning_goal: 'Review the branches of government',
      weekly_graded_answer_target: 20,
      updated_at: '2026-11-03T00:00:00.000Z',
    });

    expect(settings).toMatchObject({
      learning_goal: 'Review the branches of government',
      weekly_graded_answer_target: 20,
    });
  });

  it('persists learning goals and an optional target in the settings upsert', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn(() => ({ upsert })),
    } as unknown as SupabaseClient;

    await expect(UserSettingsService.upsertSettings(supabase, 'user-1', {
      ...DEFAULT_USER_SETTINGS,
      learning_goal: 'Review the branches of government',
      weekly_graded_answer_target: 20,
    })).resolves.toBe(true);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        learning_goal: 'Review the branches of government',
        weekly_graded_answer_target: 20,
      }),
      { onConflict: 'user_id' },
    );
  });
});
