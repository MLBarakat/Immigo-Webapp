import { Maximize2, Minimize2, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, KeyboardEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ConversationHistory } from './ConversationHistory';
import { VoiceHub } from './VoiceHub';
import { AppStatus, Message } from '../context/conversationContextTypes';
import { DisplayUser } from '../types/user';

interface CenterPanelProps {
  conversationHistory: readonly Message[];
  displayUser: DisplayUser;
  interimTranscript: string;
  appStatus: AppStatus;
  isModelLoading: boolean;
  isVadReady: boolean;
  isSessionActive: boolean;
  isVoiceSessionActive: boolean;
  errorMessage: string | null;
  hasMoreHistory: boolean;
  onSendMessage: (message: string) => void;
  onStartSession: () => void;
  onEndSession: () => void;
  onLoadOlder: () => void;
  onClearError: () => void;
  onToggleFocus?: () => void;
  isFocusMode?: boolean;
  micConsentVersion?: string | null;
  onMicConsent?: () => Promise<void>;
  micAccessError?: string | null;
  onClearMicAccessError?: () => void;
  initError?: string | null;
  isAudioRetryPending?: boolean;
}

const STATUS_COLORS: Record<AppStatus, string> = {
  idle: 'text-immigo-gray-600 dark:text-gray-300',
  // 'connecting' = session starting, mic not confirmed. Renders as idle so a
  // consent/permission prompt never looks like "Thinking".
  connecting: 'text-immigo-gray-600 dark:text-gray-300',
  listening: 'text-emerald-700 dark:text-emerald-300',
  processing: 'text-amber-700 dark:text-amber-300',
  speaking: 'text-art-blue-700 dark:text-art-blue-200',
  error: 'text-art-red-700 dark:text-art-red-300',
};

const STATUS_DOT_COLORS: Record<AppStatus, string> = {
  idle: 'bg-immigo-gray-400',
  connecting: 'bg-immigo-gray-400',
  listening: 'bg-green-500 animate-pulse',
  processing: 'bg-amber-500 animate-pulse',
  speaking: 'bg-art-blue-500 animate-pulse',
  error: 'bg-art-red-600',
};

// A soft tint inside the glass gives each state its own "liquid" colour without
// changing the established status labels or dot colours.
const STATUS_GLOW_COLORS: Record<AppStatus, string> = {
  idle: 'bg-slate-400/25',
  connecting: 'bg-slate-400/25',
  listening: 'bg-emerald-400/30',
  processing: 'bg-amber-400/30',
  speaking: 'bg-art-blue-400/30',
  error: 'bg-art-red-500/30',
};

export function CenterPanel({
  conversationHistory,
  displayUser,
  interimTranscript,
  appStatus,
  isModelLoading,
  isVadReady,
  isSessionActive,
  isVoiceSessionActive,
  errorMessage,
  hasMoreHistory,
  onSendMessage,
  onStartSession,
  onEndSession,
  onLoadOlder,
  onClearError,
  onToggleFocus,
  isFocusMode = false,
  micConsentVersion,
  onMicConsent,
  micAccessError,
  onClearMicAccessError,
  initError,
  isAudioRetryPending,
}: CenterPanelProps) {
  const [message, setMessage] = useState('');
  const [isStatusVisible, setIsStatusVisible] = useState(true);
  const previousStatusRef = useRef(appStatus);
  const { t } = useTranslation('conversation');
  const isReadyStatus = appStatus === 'idle' || appStatus === 'connecting';
  const statusLabelKeys: Record<AppStatus, string> = {
    idle: 'workspace.center.status.ready',
    connecting: 'workspace.center.status.ready',
    listening: 'workspace.center.status.listening',
    processing: 'workspace.center.status.thinking',
    speaking: 'workspace.center.status.speaking',
    error: 'workspace.center.status.error',
  };

  useEffect(() => {
    if (previousStatusRef.current === appStatus) return;
    previousStatusRef.current = appStatus;
    setIsStatusVisible(true);
  }, [appStatus]);

  const revealStatusIsland = useCallback(() => {
    setIsStatusVisible(true);
  }, []);

  const hideStatusIsland = useCallback(() => {
    setIsStatusVisible(current => (current ? false : current));
  }, []);

  const handleSend = () => {
    const text = message.trim();
    if (!text || isVoiceSessionActive) return;
    onSendMessage(text);
    setMessage('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(68, Math.min(textarea.scrollHeight, 120))}px`;
    textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden';
    setMessage(e.target.value);
  };

  const isEmpty = !message.trim();

  return (
    <main className="relative flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-immigo-gray-50 dark:bg-gray-900">
      {/* Floating status island — overlays the conversation so chat bubbles can scroll behind it. */}
      <div
        data-testid="app-status-island-wrapper"
        data-visible={isStatusVisible}
        aria-hidden={!isStatusVisible}
        className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-4 transition-transform duration-[800ms] ease-in-out motion-reduce:transition-none sm:px-6 transform-gpu will-change-transform ${
          isStatusVisible ? 'translate-y-3' : '-translate-y-full'
        }`}
      >
        <div
          data-testid="app-status-island"
          className={`relative inline-flex min-h-9 items-center justify-center overflow-hidden rounded-full border border-white/70 bg-white/60 px-4 py-2 shadow-[0_10px_35px_-12px_rgba(15,23,42,0.45),0_2px_8px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-inset ring-white/50 backdrop-blur-2xl backdrop-saturate-150 transition-opacity duration-200 motion-reduce:transition-none transform-gpu will-change-transform dark:border-white/10 dark:bg-gray-900/60 dark:shadow-[0_12px_35px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)] dark:ring-white/10 ${
            // On hide the island stays fully opaque while it slides up, then
            // fades only once it is clipped by the panel edge (no shadow bleed
            // at rest). On show it fades in immediately while sliding down.
            isStatusVisible ? 'opacity-100' : 'opacity-0 delay-[600ms]'
          }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -left-6 top-1/2 h-12 w-28 -translate-y-1/2 rounded-full blur-2xl ${STATUS_GLOW_COLORS[appStatus]}`}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/35 via-transparent to-white/5 dark:from-white/10 dark:to-transparent"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/95 to-transparent dark:via-white/40"
          />
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="relative flex items-center justify-center gap-2.5 whitespace-nowrap"
          >
            {/* "Ready" intentionally renders without a dot so the word itself
                sits exactly at the centre of the island. */}
            {!isReadyStatus && (
              <span aria-hidden="true" className="relative flex h-2.5 w-2.5 flex-none">
                <span className={`absolute inset-0 rounded-full opacity-30 ${STATUS_DOT_COLORS[appStatus]}`} />
                <span className={`absolute inset-[3px] rounded-full ${STATUS_DOT_COLORS[appStatus]}`} />
              </span>
            )}
            <span className={`text-[13px] font-semibold leading-none tracking-[-0.01em] ${STATUS_COLORS[appStatus]}`}>
              {t(statusLabelKeys[appStatus])}
            </span>
          </span>
        </div>
      </div>

      {onToggleFocus && (
        <button
          type="button"
          onClick={onToggleFocus}
          className="absolute end-4 top-3 z-30 hidden items-center gap-1.5 rounded-full border border-white/60 bg-white/50 px-3 py-1.5 text-xs font-semibold text-immigo-gray-600 shadow-sm ring-1 ring-inset ring-white/40 backdrop-blur-xl transition-colors hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-art-blue-500 dark:border-white/10 dark:bg-gray-900/50 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-gray-800/70 sm:end-6 md:flex"
          aria-label={t(isFocusMode ? 'workspace.center.exitFocusAria' : 'workspace.center.enterFocusAria')}
          title={t('workspace.center.focusTitle')}
        >
          {isFocusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          <span>{t(isFocusMode ? 'workspace.center.exitFocus' : 'workspace.center.focus')}</span>
        </button>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="mx-4 mt-14 p-3 bg-art-red-50 border-l-4 border-art-red-600 rounded text-sm text-art-red-800 flex justify-between items-center shrink-0 sm:mx-6" role="alert">
          <p className="font-medium">{errorMessage}</p>
          <button onClick={onClearError} className="text-xs underline hover:text-art-red-900 cursor-pointer ml-4 shrink-0">{t('workspace.center.dismiss')}</button>
        </div>
      )}

      {/* Conversation Area */}
      <div className="flex-1 overflow-hidden min-h-0">
        {conversationHistory.length > 0 || interimTranscript ? (
          <ConversationHistory
            messages={conversationHistory}
            displayUser={displayUser}
            interimTranscript={interimTranscript}
            onLoadOlder={onLoadOlder}
            hasMore={hasMoreHistory}
            onUserScroll={hideStatusIsland}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-full bg-art-blue-50 border-2 border-art-blue-100 flex items-center justify-center mb-4">
              <span className="text-2xl">🏛</span>
            </div>
            <h2 className="text-base font-bold text-deep-navy mb-2">{t('workspace.center.readyToPractice')}</h2>
            <p className="text-sm text-immigo-gray-500 max-w-xs leading-relaxed">
              {t('workspace.center.readyDescription')}
            </p>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div
        className="shrink-0 bg-star-white dark:bg-gray-800 border-t border-immigo-gray-200 dark:border-gray-700"
        onPointerDown={revealStatusIsland}
        onFocusCapture={revealStatusIsland}
      >
        <div className="px-4 py-3">
          <div className="relative">
            <div className="relative min-h-[68px] rounded-xl border-2 border-immigo-gray-200 dark:border-gray-600 bg-star-white dark:bg-gray-800 transition-colors duration-150 focus-within:border-art-blue-500">
              <textarea
                rows={2}
                className="block w-full min-h-[64px] px-4 py-3 pr-[112px] border-0 rounded-xl bg-transparent resize-none focus:outline-none focus:ring-0 disabled:bg-immigo-gray-50 disabled:dark:bg-gray-700 disabled:cursor-not-allowed text-sm text-deep-navy dark:text-gray-100 placeholder-immigo-gray-400"
                style={{ maxHeight: '120px', overflowY: 'hidden' }}
                placeholder={t('workspace.center.inputPlaceholder')}
                value={message}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                disabled={isVoiceSessionActive}
                aria-label={t('workspace.center.inputAria')} data-testid="centerpanel-input"
              />

              <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1.5">
                <button
                  onClick={handleSend}
                  disabled={isEmpty || isVoiceSessionActive}
                  className="w-11 h-11 flex items-center justify-center rounded-full bg-art-blue-600 text-star-white hover:bg-art-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shrink-0 shadow-sm hover:shadow-md active:scale-95"
                  aria-label={t('workspace.center.send')} data-testid="centerpanel-send"
                >
                  <Send className="w-4 h-4" />
                </button>

                <VoiceHub
                  status={appStatus}
                  isModelLoading={isModelLoading}
                  isVadReady={isVadReady}
                  isSessionActive={isSessionActive}
                  onStartSession={onStartSession}
                  onEndSession={onEndSession}
                  micConsentVersion={micConsentVersion}
                  onMicConsent={onMicConsent}
                  micAccessError={micAccessError}
                  onClearMicAccessError={onClearMicAccessError}
                  initError={initError}
                  isAudioRetryPending={isAudioRetryPending}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}


