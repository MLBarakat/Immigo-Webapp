export interface UserSettings {
  theme?: 'system' | 'light' | 'dark';
ai_voice_id?: string;
live_feedback_enabled?: boolean;
mic_mode?: 'voice_activity' | 'push_to_talk';
barge_in_sensitivity?: number;
progress_report_frequency?: 'per_session' | 'weekly' | 'monthly';
font_size?: 'small' | 'default' | 'large';
}