import { getSupabaseClient } from '../supabaseClient';
import { logger } from '../logger';

export type FeedbackCategory = 'bug' | 'feature' | 'general' | 'compliment';

export interface FeedbackSubmission {
  category: FeedbackCategory;
  message: string;
  email?: string | null;
  locale?: string;
  appVersion?: string;
  userAgent?: string | null;
  includeDiagnostics: boolean;
}

export interface FeedbackReceipt {
  id: string;
}

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.1.0';

/**
 * Persists a Help & Support feedback message for the signed-in user.
 *
 * Diagnostics are deliberately limited to non-conversational metadata
 * (locale, app version, user agent). Audio transcripts are never attached.
 */
export async function submitFeedback(
  userId: string,
  submission: FeedbackSubmission,
): Promise<FeedbackReceipt> {
  if (!userId) throw new Error('A signed-in user is required to send feedback.');

  const message = submission.message.trim();
  if (message.length < 10) {
    throw new Error('Feedback message must be at least 10 characters.');
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('feedback')
      .insert({
        user_id: userId,
        category: submission.category,
        message,
        email: submission.email?.trim() || null,
        locale: submission.locale ?? null,
        app_version: submission.appVersion ?? APP_VERSION,
        user_agent: submission.includeDiagnostics ? submission.userAgent ?? null : null,
        include_diagnostics: submission.includeDiagnostics,
      })
      .select('id')
      .single();

    if (error) throw error;
    if (!data?.id) throw new Error('Feedback was saved without a receipt id.');

    logger.info('Support feedback submitted.', { userId, category: submission.category });
    return { id: String(data.id) };
  } catch (error) {
    logger.error('Failed to submit support feedback.', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
