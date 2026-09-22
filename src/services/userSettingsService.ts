import { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_USER_SETTINGS, UserSettings } from '../types/settings';
import { logger } from '../logger';

/**
 * Shape of a row in the `user_settings` Supabase table.
 * The column names are snake_case to match the DB schema.
 */
export interface UserSettingsRow {
  user_id: string;
  language: string;
  theme: string;
  ai_voice_id: string | null;
  live_feedback_enabled: boolean;
  mic_mode: string;
  barge_in: string;
  progress_report_frequency: string;
  font_size: string | null;
  has_seen_welcome: boolean;
  updated_at: string;
}

/** Maps a DB row to the application `UserSettings` shape. */
function rowToSettings(row: UserSettingsRow): Partial<UserSettings> {
  return {
    language: row.language ?? DEFAULT_USER_SETTINGS.language,
    theme: row.theme as UserSettings['theme'],
    ai_voice_id: row.ai_voice_id ?? undefined,
    live_feedback_enabled: row.live_feedback_enabled,
    mic_mode: row.mic_mode as UserSettings['mic_mode'],
    barge_in: row.barge_in as UserSettings['barge_in'],
    progress_report_frequency: row.progress_report_frequency as UserSettings['progress_report_frequency'],
    font_size: (row.font_size ?? undefined) as UserSettings['font_size'],
    has_seen_welcome: row.has_seen_welcome,
  };
}

/** Maps application `UserSettings` to a DB upsert payload. */
function settingsToRow(userId: string, settings: UserSettings): Omit<UserSettingsRow, 'updated_at'> {
  return {
    user_id: userId,
    language: settings.language,
    theme: settings.theme,
    ai_voice_id: settings.ai_voice_id ?? null,
    live_feedback_enabled: settings.live_feedback_enabled,
    mic_mode: settings.mic_mode,
    barge_in: settings.barge_in,
    progress_report_frequency: settings.progress_report_frequency,
    font_size: settings.font_size ?? null,
    has_seen_welcome: settings.has_seen_welcome ?? false,
  };
}

export class UserSettingsService {
  /**
   * Fetches the settings row for `userId`.
   * Returns `null` if no row exists or the request fails.
   */
  static async fetchSettings(
    supabase: SupabaseClient,
    userId: string,
  ): Promise<Partial<UserSettings> | null> {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();          // returns null (not error) when row is absent

      if (error) {
        logger.error('Failed to fetch user_settings row.', { error: error.message, userId });
        return null;
      }

      return data ? rowToSettings(data as UserSettingsRow) : null;
    } catch (err) {
      logger.error('Exception fetching user_settings.', { error: String(err), userId });
      return null;
    }
  }

  /**
   * Upserts (insert-or-update) the settings row for `userId`.
   * Uses `onConflict: 'user_id'` so that a missing row is created
   * and an existing row is updated atomically.
   *
   * @returns true on success, false on failure.
   */
  static async upsertSettings(
    supabase: SupabaseClient,
    userId: string,
    settings: UserSettings,
  ): Promise<boolean> {
    try {
      const payload = settingsToRow(userId, settings);
      const { error } = await supabase
        .from('user_settings')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) {
        logger.error('Failed to upsert user_settings row.', { error: error.message, userId });
        return false;
      }

      return true;
    } catch (err) {
      logger.error('Exception upserting user_settings.', { error: String(err), userId });
      return false;
    }
  }

  /**
   * Inserts a brand-new settings row with the application defaults,
   * optionally overriding specific fields (e.g. language-related fields
   * chosen during sign-up).
   *
   * If a row already exists this is a no-op (upsert with merge).
   */
  static async createDefaultSettings(
    supabase: SupabaseClient,
    userId: string,
    overrides: Partial<UserSettings> = {},
  ): Promise<boolean> {
    const initial: UserSettings = { ...DEFAULT_USER_SETTINGS, ...overrides };
    return UserSettingsService.upsertSettings(supabase, userId, initial);
  }
}
