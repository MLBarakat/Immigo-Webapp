export type ThemeOption = 'system' | 'light' | 'dark';
export type MicMode = 'voice_activity' | 'push_to_talk';
export type BargeIn = 'relaxed' | 'balanced' | 'aggressive';
export type ProgressReportFrequency = 'after_session' | 'daily' | 'weekly' | 'monthly';

export interface UserSettings {
  theme: ThemeOption;
  ai_voice_id?: string;
  live_feedback_enabled: boolean;
  mic_mode: MicMode;
  barge_in: BargeIn;
  progress_report_frequency: ProgressReportFrequency;
  font_size?: 'small' | 'default' | 'large';
}