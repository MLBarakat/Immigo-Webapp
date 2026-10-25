import { useCallback, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bug,
  Check,
  ChevronDown,
  Copy,
  Heart,
  LifeBuoy,
  Lightbulb,
  Mail,
  MessageSquare,
  Send,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { legalEntityConfig } from '../legal/terms-content';
import { submitFeedback, type FeedbackCategory } from '../services/feedbackService';
import { analytics } from '../analytics';
import { logger } from '../logger';

interface HelpSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FAQ_KEYS = [
  'start',
  'mic',
  'bluetooth',
  'language',
  'audio',
  'subscription',
  'account',
  'study',
] as const;

const CATEGORY_OPTIONS: Array<{ value: FeedbackCategory; key: string; icon: typeof Bug }> = [
  { value: 'bug', key: 'categoryBug', icon: Bug },
  { value: 'feature', key: 'categoryFeature', icon: Lightbulb },
  { value: 'general', key: 'categoryGeneral', icon: MessageSquare },
  { value: 'compliment', key: 'categoryCompliment', icon: Heart },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 4000;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(area);
      return copied;
    } catch {
      return false;
    }
  }
}

export function HelpSupportModal({ isOpen, onClose }: HelpSupportModalProps): JSX.Element | null {
  const { t, i18n } = useTranslation('common');
  const { user } = useAuth();
  const modalRef = useFocusTrap(isOpen);
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  const handleClose = useCallback(() => {
    if (typeof document !== 'undefined') document.documentElement.classList.remove('overflow-hidden');
    onClose();
  }, [onClose]);

  const handleCopySupportEmail = useCallback(async (): Promise<void> => {
    const copied = await copyText(legalEntityConfig.supportEmail);
    setEmailCopied(copied);
    if (copied) window.setTimeout(() => setEmailCopied(false), 2500);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!user?.id) {
      setError(t('help.submitFailed'));
      setStatus('error');
      return;
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length < MIN_MESSAGE_LENGTH) {
      setError(t('help.messageTooShort', { count: MIN_MESSAGE_LENGTH }));
      return;
    }
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
      setError(t('help.emailInvalid'));
      return;
    }

    setStatus('submitting');
    setError(null);
    try {
      const receipt = await submitFeedback(user.id, {
        category,
        message: trimmedMessage,
        email: email.trim() || null,
        locale: i18n.language,
        userAgent: includeDiagnostics && typeof navigator !== 'undefined' ? navigator.userAgent : null,
        includeDiagnostics,
      });
      setReference(receipt.id.slice(0, 8).toUpperCase());
      setStatus('success');
      setMessage('');
      analytics.track('support_feedback_submitted', { category, includeDiagnostics });
    } catch (submitError) {
      logger.error('Help & Support feedback submission failed.', {
        error: submitError instanceof Error ? submitError.message : String(submitError),
      });
      setError(t('help.submitFailed'));
      setStatus('error');
    }
  };

  const handleSendAnother = useCallback((): void => {
    setStatus('idle');
    setReference(null);
    setError(null);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4" role="presentation" onClick={handleClose}>
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-support-title"
        className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-star-white outline-none dark:bg-gray-800 sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-immigo-gray-200 p-4 dark:border-gray-700 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-art-blue-100 text-art-blue-700 dark:bg-art-blue-900/40 dark:text-art-blue-200">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <h2 id="help-support-title" className="text-xl font-bold text-deep-navy dark:text-gray-100 sm:text-2xl">{t('help.title')}</h2>
              <p className="text-sm text-immigo-gray-600 dark:text-gray-400">{t('help.heroDescription')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('help.close')}
            className="rounded-full p-2 text-immigo-gray-600 hover:bg-immigo-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <span aria-hidden="true" className="text-2xl leading-none">&times;</span>
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          <section aria-labelledby="help-faq-title">
            <h3 id="help-faq-title" className="mb-3 text-lg font-bold text-deep-navy dark:text-gray-100">{t('help.faqTitle')}</h3>
            <div className="divide-y divide-immigo-gray-200 overflow-hidden rounded-xl border border-immigo-gray-200 dark:divide-gray-700 dark:border-gray-700">
              {FAQ_KEYS.map(key => (
                <details key={key} className="group bg-star-white dark:bg-gray-800">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-semibold text-deep-navy hover:bg-immigo-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/50 [&::-webkit-details-marker]:hidden">
                    <span>{t(`help.faq.${key}Title`)}</span>
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-immigo-gray-600 transition-transform group-open:rotate-180 dark:text-gray-400" />
                  </summary>
                  <p className="px-3 pb-3 text-sm leading-relaxed text-immigo-gray-700 dark:text-gray-300">
                    {t(`help.faq.${key}Body`)}
                  </p>
                </details>
              ))}
            </div>
          </section>

          <section aria-labelledby="help-contact-title" className="rounded-xl border border-immigo-gray-200 bg-immigo-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <h3 id="help-contact-title" className="flex items-center gap-2 text-lg font-bold text-deep-navy dark:text-gray-100">
              <Mail className="h-5 w-5 text-art-blue-600" /> {t('help.contactTitle')}
            </h3>
            <p className="mt-1 text-sm text-immigo-gray-700 dark:text-gray-300">{t('help.contactDescription')}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={`mailto:${legalEntityConfig.supportEmail}?subject=${encodeURIComponent(t('help.emailSubject'))}`}
                className="inline-flex items-center gap-2 rounded-lg bg-art-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-art-blue-700"
              >
                <Mail className="h-4 w-4" /> {t('help.emailSupport')}
              </a>
              <button
                type="button"
                onClick={() => { void handleCopySupportEmail(); }}
                className="inline-flex items-center gap-2 rounded-lg border border-immigo-gray-300 px-3 py-2 text-sm font-semibold text-deep-navy hover:bg-immigo-gray-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                {emailCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {emailCopied ? t('help.emailCopied') : t('help.copyEmail')}
              </button>
              <span className="text-sm font-medium text-immigo-gray-700 dark:text-gray-300">{legalEntityConfig.supportEmail}</span>
            </div>
          </section>

          <section aria-labelledby="help-feedback-title">
            <h3 id="help-feedback-title" className="text-lg font-bold text-deep-navy dark:text-gray-100">{t('help.feedbackTitle')}</h3>
            <p className="mt-1 text-sm text-immigo-gray-700 dark:text-gray-300">{t('help.feedbackDescription')}</p>

            {status === 'success' ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20" role="status">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-emerald-900 dark:text-emerald-100">{t('help.successTitle')}</p>
                    <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">{t('help.successBody')}</p>
                    {reference && (
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        {t('help.reference', { id: reference })}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleSendAnother}
                      className="mt-3 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800"
                    >
                      {t('help.submitAnother')}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={(event) => { void handleSubmit(event); }} className="mt-4 space-y-4">
                <div>
                  <span className="mb-2 block text-sm font-semibold text-deep-navy dark:text-gray-100">{t('help.categoryLabel')}</span>
                  <div role="radiogroup" aria-label={t('help.categoryLabel')} className="flex flex-wrap gap-2">
                    {CATEGORY_OPTIONS.map(option => {
                      const Icon = option.icon;
                      const selected = category === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setCategory(option.value)}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${selected
                            ? 'border-art-blue-600 bg-art-blue-600 text-white'
                            : 'border-immigo-gray-300 bg-star-white text-deep-navy hover:bg-immigo-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'}`}
                        >
                          <Icon className="h-4 w-4" /> {t(`help.${option.key}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block text-sm">
                  <span className="mb-1 block font-semibold text-deep-navy dark:text-gray-100">{t('help.messageLabel')}</span>
                  <textarea
                    value={message}
                    onChange={event => setMessage(event.target.value)}
                    maxLength={MAX_MESSAGE_LENGTH}
                    rows={5}
                    required
                    placeholder={t('help.messagePlaceholder')}
                    className="w-full rounded-xl border-2 border-immigo-gray-300 bg-star-white p-3 text-sm text-deep-navy outline-none focus:border-art-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                  <span className="mt-1 flex justify-between text-xs text-immigo-gray-600 dark:text-gray-400">
                    <span>{t('help.messageHint', { count: message.length, max: MAX_MESSAGE_LENGTH })}</span>
                    <span>{t('help.messageMinimum', { count: MIN_MESSAGE_LENGTH })}</span>
                  </span>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block font-semibold text-deep-navy dark:text-gray-100">{t('help.emailLabel')}</span>
                  <input
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder={t('help.emailPlaceholder')}
                    autoComplete="email"
                    className="w-full rounded-xl border-2 border-immigo-gray-300 bg-star-white p-3 text-sm text-deep-navy outline-none focus:border-art-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-immigo-gray-200 bg-immigo-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                  <input
                    type="checkbox"
                    checked={includeDiagnostics}
                    onChange={event => setIncludeDiagnostics(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-immigo-gray-300 text-art-blue-600 focus:ring-art-blue-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-deep-navy dark:text-gray-100">{t('help.diagnosticsLabel')}</span>
                    <span className="block text-xs text-immigo-gray-600 dark:text-gray-400">{t('help.diagnosticsHint')}</span>
                  </span>
                </label>

                {error && (
                  <p className="rounded-lg bg-art-red-50 p-2 text-sm font-medium text-art-red-700 dark:bg-art-red-900/20 dark:text-art-red-200" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === 'submitting' || message.trim().length < MIN_MESSAGE_LENGTH}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-art-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-art-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  <Send className="h-4 w-4" />
                  {status === 'submitting' ? t('help.submitting') : t('help.submit')}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
