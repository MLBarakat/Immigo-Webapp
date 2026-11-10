/** Practice/Study focus onboarding shown before the first question of a mode. */
export interface FocusOnboardingState {
  mode: 'practice' | 'study';
  submitting: boolean;
  error: string | null;
}
