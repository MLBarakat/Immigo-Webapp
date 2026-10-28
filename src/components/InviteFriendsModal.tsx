import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Copy,
  Facebook,
  Gift,
  Linkedin,
  Mail,
  MessageCircle,
  MessageSquare,
  Send,
  Share2,
  Twitter,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { analytics } from '../analytics';
import { logger } from '../logger';

interface InviteFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ShareChannel = 'native' | 'whatsapp' | 'facebook' | 'x' | 'linkedin' | 'telegram' | 'email' | 'sms';

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

export function InviteFriendsModal({ isOpen, onClose }: InviteFriendsModalProps): JSX.Element | null {
  const { t, i18n } = useTranslation('common');
  const isArabic = i18n.language === 'ar-SA';
  const { user } = useAuth();
  const modalRef = useFocusTrap(isOpen);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const referralCode = useMemo(() => {
    const compact = (user?.id ?? '').replace(/-/g, '').slice(0, 8).toUpperCase();
    return compact || 'IMMIGO';
  }, [user?.id]);

  const shareUrl = useMemo(() => {
    const fallback = `https://app.immigo.app/?ref=${encodeURIComponent(referralCode)}`;
    if (typeof window === 'undefined') return fallback;
    try {
      const origin = window.location.origin && window.location.origin !== 'null'
        ? window.location.origin
        : 'https://app.immigo.app';
      const url = new URL(import.meta.env.BASE_URL || '/', origin);
      url.searchParams.set('ref', referralCode);
      return url.toString();
    } catch {
      return fallback;
    }
  }, [referralCode]);

  const shareText = t('invite.shareText', { url: shareUrl });
  const nativeShareSupported = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleClose = useCallback(() => {
    setError(null);
    setCopied(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, isOpen]);

  const handleCopy = useCallback(async (): Promise<void> => {
    const success = await copyText(shareUrl);
    setCopied(success);
    setError(success ? null : t('invite.copyFailed'));
    if (success) {
      window.setTimeout(() => setCopied(false), 2500);
      analytics.track('invite_shared', { channel: 'copy_link' });
    }
  }, [shareUrl, t]);

  const handleNativeShare = useCallback(async (): Promise<void> => {
    if (!nativeShareSupported) {
      await handleCopy();
      return;
    }
    try {
      await navigator.share({
        title: t('invite.shareTitle'),
        text: shareText,
      });
      analytics.track('invite_shared', { channel: 'native' });
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === 'AbortError') return;
      logger.warn('Native invite share failed; falling back to copy.', {
        error: shareError instanceof Error ? shareError.message : String(shareError),
      });
      await handleCopy();
    }
  }, [handleCopy, nativeShareSupported, shareText, t]);

  const openChannel = useCallback((channel: ShareChannel): void => {
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);
    // X and Telegram render `text` and `url` separately; using shareText there
    // would duplicate the link because shareText already embeds it.
    const encodedShortText = encodeURIComponent(t('invite.shareTitle'));
    const emailSubject = encodeURIComponent(t('invite.emailSubject'));
    const emailBody = encodeURIComponent(t('invite.emailBody', { url: shareUrl }));

    let href: string | null = null;
    switch (channel) {
      case 'whatsapp':
        href = `https://wa.me/?text=${encodedText}`;
        break;
      case 'facebook':
        href = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
      case 'x':
        href = `https://twitter.com/intent/tweet?text=${encodedShortText}&url=${encodedUrl}`;
        break;
      case 'linkedin':
        href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        break;
      case 'telegram':
        href = `https://t.me/share/url?url=${encodedUrl}&text=${encodedShortText}`;
        break;
      case 'email':
        href = `mailto:?subject=${emailSubject}&body=${emailBody}`;
        break;
      case 'sms':
        href = `sms:?&body=${encodedText}`;
        break;
      default:
        return;
    }

    try {
      if (channel === 'email' || channel === 'sms') {
        window.location.href = href;
      } else {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
      analytics.track('invite_shared', { channel });
      setError(null);
    } catch (openError) {
      logger.warn('Invite share channel could not be opened.', {
        channel,
        error: openError instanceof Error ? openError.message : String(openError),
      });
      setError(t('invite.copyFailed'));
    }
  }, [shareText, shareUrl, t]);

  if (!isOpen) return null;

  const channels: Array<{ id: ShareChannel; label: string; icon: typeof Mail; className: string }> = [
    { id: 'whatsapp', label: t('invite.whatsapp'), icon: MessageCircle, className: 'bg-[#25D366] text-white hover:bg-[#1fb457]' },
    { id: 'facebook', label: t('invite.facebook'), icon: Facebook, className: 'bg-[#1877F2] text-white hover:bg-[#0f65d5]' },
    { id: 'x', label: t('invite.twitter'), icon: Twitter, className: 'bg-black text-white hover:bg-gray-800' },
    { id: 'linkedin', label: t('invite.linkedin'), icon: Linkedin, className: 'bg-[#0A66C2] text-white hover:bg-[#084f96]' },
    { id: 'telegram', label: t('invite.telegram'), icon: Send, className: 'bg-[#229ED9] text-white hover:bg-[#1b86b8]' },
    { id: 'email', label: t('invite.email'), icon: Mail, className: 'bg-immigo-gray-100 text-deep-navy hover:bg-immigo-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600' },
    { id: 'sms', label: t('invite.sms'), icon: MessageSquare, className: 'bg-immigo-gray-100 text-deep-navy hover:bg-immigo-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4" role="presentation" onClick={handleClose}>
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-friends-title"
        dir={isArabic ? 'rtl' : 'ltr'}
        className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-star-white outline-none dark:bg-gray-800 sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-immigo-gray-200 p-4 dark:border-gray-700 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-art-blue-100 text-art-blue-700 dark:bg-art-blue-900/40 dark:text-art-blue-200">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h2 id="invite-friends-title" className="text-xl font-bold text-deep-navy dark:text-gray-100">{t('invite.title')}</h2>
              <p className="text-sm text-immigo-gray-600 dark:text-gray-400">{t('invite.heroDescription')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('invite.close')}
            className="rounded-full p-2 text-immigo-gray-600 hover:bg-immigo-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          <div className="rounded-xl border border-immigo-gray-200 bg-immigo-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-deep-navy dark:text-gray-100">{t('invite.linkLabel')}</span>
              <span className="rounded-full bg-art-blue-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-art-blue-800 dark:bg-art-blue-900/40 dark:text-art-blue-200">
                {t('invite.codeLabel')}: {referralCode}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                onFocus={event => event.currentTarget.select()}
                aria-label={t('invite.linkLabel')}
                dir="ltr"
                className="min-w-0 flex-1 rounded-lg border border-immigo-gray-300 bg-star-white px-3 py-2 text-sm text-deep-navy dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => { void handleCopy(); }}
                className="inline-flex flex-shrink-0 items-center gap-2 rounded-lg bg-art-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-art-blue-700"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t('invite.copied') : t('invite.copyLink')}
              </button>
            </div>
            {error && (
              <p className="mt-2 text-sm font-medium text-art-red-700 dark:text-art-red-300" role="alert">{error}</p>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => { void handleNativeShare(); }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-art-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-art-blue-700"
            >
              <Share2 className="h-4 w-4" />
              {nativeShareSupported ? t('invite.shareNative') : t('invite.copyLink')}
            </button>
            {!nativeShareSupported && (
              <p className="mt-2 text-center text-xs text-immigo-gray-600 dark:text-gray-400">{t('invite.nativeUnavailable')}</p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-deep-navy dark:text-gray-100">{t('invite.channelsTitle')}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {channels.map(channel => {
                const Icon = channel.icon;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => openChannel(channel.id)}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${channel.className}`}
                  >
                    <Icon className="h-4 w-4" />
                    {channel.label}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="rounded-lg bg-immigo-gray-50 p-3 text-xs leading-relaxed text-immigo-gray-600 dark:bg-gray-900/50 dark:text-gray-400">
            {t('invite.privacyNote')}
          </p>
        </div>
      </div>
    </div>
  );
}
