import { useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppStatus } from '../context/conversationContextTypes';
import { AnimatedStatusButton } from './AnimatedStatusButton';
import { logger } from '../logger';
import { MicConsentModal } from './MicConsentModal';
import { hasMicConsent } from '../utils/micConsent';

interface VoiceHubProps {
  readonly status: AppStatus;
  readonly isModelLoading?: boolean;
  readonly isVadReady?: boolean;
  readonly modelLoadingProgress?: number;
  readonly isSessionActive: boolean;
  readonly onStartSession: () => void;
  readonly onEndSession: () => void;
  readonly micConsentVersion?: string | null;
  readonly onMicConsent?: () => Promise<void>;
  readonly micAccessError?: string | null;
  readonly onClearMicAccessError?: () => void;
}

export function VoiceHub({ 
  status, 
  isModelLoading = false,
  isVadReady = true,
  modelLoadingProgress = 0,
  isSessionActive, 
  onStartSession, 
  onEndSession,
  micConsentVersion = null,
  onMicConsent,
  micAccessError = null,
  onClearMicAccessError,
}: VoiceHubProps): JSX.Element {
  const { t } = useTranslation('conversation');
  
  // Track user interaction patterns to block adversarial click spamming
  const lastInteractionTimestampRef = useRef<number>(0);
  const [showMicConsent, setShowMicConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const DEBOUNCE_DELAY_MS = 800; // Rigid interaction safety threshold window
  const isListenerLoading = isModelLoading || !isVadReady;

  const handleButtonClick = useCallback(() => {
    const currentTimestamp = performance.now();
    const durationSinceLastClick = currentTimestamp - lastInteractionTimestampRef.current;

    if (durationSinceLastClick < DEBOUNCE_DELAY_MS) {
      logger.warn('Adversarial interaction guard engaged: user button click spamming intercepted. Suppressing event.');
      return;
    }

    // Lock interaction loops while the background neural worker is executing matrix splits
    if (status === 'processing' || isListenerLoading) {
      logger.warn('Interaction locked: pipeline is verifying truth ledger audio chunks. Disabling toggle.');
      return;
    }

    lastInteractionTimestampRef.current = currentTimestamp;
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
      logger.info('VoiceHub: manual user intervention captured. Launching speech session recording.');
      onStartSession();
    }
  }, [isSessionActive, status, isListenerLoading, onStartSession, onEndSession, micConsentVersion, onClearMicAccessError]);

  const handleMicConsentAccept = useCallback(async () => {
    if (!onMicConsent) {
      setConsentError('Unable to save microphone consent. Please try again.');
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
      logger.error('Failed to persist microphone consent.', { error: String(error) });
    }
  }, [onMicConsent, onStartSession, isListenerLoading]);

  const isProcessingActive = status === 'processing';
  const isButtonDisabled = isProcessingActive || (isListenerLoading && !isSessionActive);

  return (
    <>
      {showMicConsent && (
        <MicConsentModal onAccept={() => { void handleMicConsentAccept(); }} onCancel={() => { setShowMicConsent(false); setConsentError(null); }} error={consentError} />
      )}
    <div className="flex flex-col items-center justify-center gap-1" role="region" aria-label={t('workspace.voice.region')}>
      {isListenerLoading && !isSessionActive && (
        <span className="absolute sr-only" role="status">
          {t('workspace.voice.loading', { progress: Math.round(modelLoadingProgress) })}
        </span>
      )}
      {micAccessError && <p className="max-w-xs text-center text-xs text-art-red-600" role="alert">{micAccessError}</p>}
      <button 
        onClick={handleButtonClick} 
        disabled={isButtonDisabled}
        className={`w-11 h-11 flex items-center justify-center rounded-full transition-transform active:scale-95 duration-200 ${
          isButtonDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        } ${
          isListenerLoading && !isSessionActive ? 'animate-pulse ring-2 ring-art-blue-400 ring-offset-2' : ''
        }`} 
        aria-label={t(isSessionActive ? 'workspace.voice.stop' : 'workspace.voice.start')}
        aria-busy={isButtonDisabled || (isListenerLoading && isSessionActive)}
        aria-live="polite"
        title={isListenerLoading ? t('workspace.voice.loading', { progress: Math.round(modelLoadingProgress) }) : undefined}
      >
        <AnimatedStatusButton status={status} />
      </button>
    </div>
    </>
  );
}