import { useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppStatus } from '../context/conversationContextTypes';
import { AnimatedStatusButton } from './AnimatedStatusButton';
import { logger } from '../logger';
import { MicConsentModal } from './MicConsentModal';
import { hasMicConsent } from '../utils/micConsent';
import { unlockAudioPlayback } from '../utils/audioUtils';

interface VoiceHubProps {
  readonly status: AppStatus;
  readonly isModelLoading?: boolean;
  readonly isVadReady?: boolean;
  readonly isSessionActive: boolean;
  readonly onStartSession: () => void;
  readonly onEndSession: () => void;
  readonly micConsentVersion?: string | null;
  readonly onMicConsent?: () => Promise<void>;
  readonly onPrepareMic?: () => Promise<boolean>;
  readonly onReleasePreparedMic?: () => void;
  readonly micAccessError?: string | null;
  readonly onClearMicAccessError?: () => void;
  readonly initError?: string | null;
  readonly isAudioRetryPending?: boolean;
}

export function VoiceHub({ 
  status, 
  isModelLoading = false,
  isVadReady = true,
  isSessionActive, 
  onStartSession, 
  onEndSession,
  micConsentVersion = null,
  onMicConsent,
  onPrepareMic,
  onReleasePreparedMic,
  micAccessError = null,
  onClearMicAccessError,
  initError = null,
  isAudioRetryPending = false,
}: VoiceHubProps): JSX.Element {
  const { t } = useTranslation('conversation');
  
  // Track user interaction patterns to block adversarial click spamming
  const lastInteractionTimestampRef = useRef<number>(0);
  const [showMicConsent, setShowMicConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [showLoadingProgress, setShowLoadingProgress] = useState(false);
  const DEBOUNCE_DELAY_MS = 800; // Rigid interaction safety threshold window
  // Lazy init: idle (no model yet) must allow the first tap to initialize.
  // Only block while init is actually in flight or a turn is processing.
  const isListenerLoading = isModelLoading;
  const isIdleUninitialized = !isVadReady && !isModelLoading && !isSessionActive;

  const handleButtonClick = useCallback(() => {
    const currentTimestamp = performance.now();
    const durationSinceLastClick = currentTimestamp - lastInteractionTimestampRef.current;

    if (!isSessionActive && durationSinceLastClick < DEBOUNCE_DELAY_MS) {
      logger.warn('Adversarial interaction guard engaged: user button click spamming intercepted. Suppressing event.');
      return;
    }

    // Lock interaction loops while the background neural worker is executing
    // matrix splits. 'connecting' (mic prompt pending) is intentionally NOT
    // locked: the tap must reach onEndSession so a hung prompt can be cancelled.
    if (!isSessionActive && (status === 'processing' || isListenerLoading)) {
      logger.warn('Interaction locked: pipeline is verifying truth ledger audio chunks. Disabling toggle.');
      return;
    }

    lastInteractionTimestampRef.current = currentTimestamp;
    unlockAudioPlayback();
    onClearMicAccessError?.();
    setConsentError(null);

    if (isSessionActive) {
      logger.info('VoiceHub: manual user intervention captured. Discontinuing speech session recording.');
      onEndSession();
    } else {
      // One-time microphone/voice disclosure before the first recording (E2 consent).
      if (!hasMicConsent(micConsentVersion)) {
        setShowMicConsent(true);
        return;
      }
      void onPrepareMic?.();
      logger.info('VoiceHub: manual user intervention captured. Launching speech session recording.');
      onStartSession();
    }
  }, [isSessionActive, status, isListenerLoading, onStartSession, onEndSession, micConsentVersion, onClearMicAccessError, onPrepareMic]);

  const handleMicConsentAccept = useCallback(async () => {
    // Unlock audible playback while still inside the consent-accept tap.
    unlockAudioPlayback();
    void onPrepareMic?.();
    if (!onMicConsent) {
      setConsentError('Unable to save microphone consent. Please try again.');
      onReleasePreparedMic?.();
      logger.error('Microphone consent cannot be accepted because persistence is unavailable.');
      return;
    }
    try {
      await onMicConsent();
      setShowMicConsent(false);
      logger.info('VoiceHub: microphone consent acknowledged. Launching speech session recording.');
      if (!isListenerLoading) onStartSession();
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : 'Unable to save microphone consent. Please try again.');
      onReleasePreparedMic?.();
      logger.error('Failed to persist microphone consent.', { error: String(error) });
    }
  }, [onMicConsent, onStartSession, onPrepareMic, onReleasePreparedMic, isListenerLoading]);

  // 'connecting' = session starting, mic prompt pending. It must not be
  // disabled (the tap is the only way to cancel a stuck prompt) and it must
  // look idle, never busy — so it is excluded from both.
  const isProcessingActive = status === 'processing';
  const isButtonDisabled = !isSessionActive && (isProcessingActive || isListenerLoading);
  const isPulsing = isListenerLoading && !isSessionActive;
  // 'connecting' means a session exists but capture is not running yet — the
  // mic prompt is still open. It must look exactly like idle, never like work.
  const visualStatus: 'idle' | 'listening' | 'processing' | 'speaking' | 'error' =
    isSessionActive && status !== 'connecting' ? status : 'idle';

  return (
    <>
      {showMicConsent && (
        <MicConsentModal onAccept={() => { void handleMicConsentAccept(); }} onCancel={() => { setShowMicConsent(false); setConsentError(null); }} error={consentError} />
      )}
    <div className="relative flex flex-col items-center justify-center gap-1" role="region" aria-label={t('workspace.voice.region')}>
      {isListenerLoading && !isSessionActive && (
        <span className="absolute sr-only" role="status">
          {t('workspace.voice.loading')}
        </span>
      )}
      {micAccessError && <p className="max-w-xs text-center text-xs text-art-red-600" role="alert">{micAccessError}</p>}
      {initError && !isSessionActive && <p className="max-w-xs text-center text-xs text-art-red-600" role="alert">{initError}</p>}
      {isAudioRetryPending && (
        <p className="max-w-xs text-center text-xs font-semibold text-art-blue-600" role="status">
          {t('workspace.voice.audioRetryPending')}
        </p>
      )}
      <div
        className={`relative inline-flex items-center justify-center ${isButtonDisabled ? 'cursor-not-allowed' : ''}`}
        onMouseEnter={() => setShowLoadingProgress(true)}
        onMouseLeave={() => setShowLoadingProgress(false)}
        onFocus={() => setShowLoadingProgress(true)}
        onBlur={() => setShowLoadingProgress(false)}
      >
        <button 
          onClick={handleButtonClick} 
          onMouseEnter={() => setShowLoadingProgress(true)}
          onMouseLeave={() => setShowLoadingProgress(false)}
          onFocus={() => setShowLoadingProgress(true)}
          onBlur={() => setShowLoadingProgress(false)}
          disabled={isButtonDisabled}
          className={`relative w-11 h-11 flex items-center justify-center rounded-full transition-transform active:scale-95 duration-200 ${
            isButtonDisabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
          } ${
            isPulsing ? 'animate-pulse ring-2 ring-art-blue-400 ring-offset-2' : ''
          }`} 
          aria-label={t(isSessionActive ? 'workspace.voice.pause' : 'workspace.voice.start')}
          aria-busy={isButtonDisabled || (isListenerLoading && isSessionActive)}
          aria-live="polite" data-testid="voicehub-mic-button"
          title={isSessionActive
            ? t('workspace.voice.pause')
            : isListenerLoading
              ? t('workspace.voice.loading')
              : isIdleUninitialized
                ? t('workspace.voice.start')
                : t('workspace.voice.start')}
        >
          <AnimatedStatusButton status={visualStatus} isPulsing={isPulsing} />
        </button>
        {isListenerLoading && !isSessionActive && showLoadingProgress && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap rounded-md bg-deep-navy px-2.5 py-1.5 text-xs font-semibold text-star-white shadow-lg"
          >
            {t('workspace.voice.loading')}
          </span>
        )}
      </div>
    </div>
    </>
  );
}
