export type ThemeOption = 'system' | 'light' | 'dark';
export type MicMode = 'voice_activity' | 'push_to_talk';
export type BargeIn = 'relaxed' | 'balanced' | 'aggressive';
export type ProgressReportFrequency = 'after_session' | 'daily' | 'weekly' | 'monthly';
export type FontSize =
  | 'extra-small'
  | 'small'
  | 'default'
  | 'large'
  | 'extra-large'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl';

export interface UserSettings {
  language: string;
  theme: ThemeOption;
  ai_voice_id?: string;
  live_feedback_enabled: boolean;
  mic_mode: MicMode;
  barge_in: BargeIn;
  progress_report_frequency: ProgressReportFrequency;
  font_size?: FontSize;
  has_seen_welcome?: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  language: 'en-US',
  theme: 'system',
  ai_voice_id: 'Joanna',
  live_feedback_enabled: true,
  mic_mode: 'voice_activity',
  barge_in: 'balanced',
  progress_report_frequency: 'after_session',
  font_size: 'default',
  has_seen_welcome: false,
};
