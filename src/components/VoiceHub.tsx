import { useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppStatus } from '../context/conversationContextTypes';
import { AnimatedStatusButton } from './AnimatedStatusButton';
import { logger } from '../logger';
import { MicConsentModal } from './MicConsentModal';
import { hasMicConsent, setMicConsent } from '../utils/micConsent';

interface VoiceHubProps {
  readonly status: AppStatus;
  readonly isSessionActive: boolean;
  readonly onStartSession: () => void;
  readonly onEndSession: () => void;
}

export function VoiceHub({ 
  status, 
  isSessionActive, 
  onStartSession, 
  onEndSession 
}: VoiceHubProps): JSX.Element {
  const { t } = useTranslation('conversation');
  
  // Track user interaction patterns to block adversarial click spamming
  const lastInteractionTimestampRef = useRef<number>(0);
  const [showMicConsent, setShowMicConsent] = useState(false);
  const DEBOUNCE_DELAY_MS = 800; // Rigid interaction safety threshold window

  const handleButtonClick = useCallback(() => {
    const currentTimestamp = performance.now();
    const durationSinceLastClick = currentTimestamp - lastInteractionTimestampRef.current;

    if (durationSinceLastClick < DEBOUNCE_DELAY_MS) {
      logger.warn('Adversarial interaction guard engaged: user button click spamming intercepted. Suppressing event.');
      return;
    }

    // Lock interaction loops while the background neural worker is executing matrix splits
    if (status === 'processing') {
      logger.warn('Interaction locked: pipeline is verifying truth ledger audio chunks. Disabling toggle.');
      return;
    }

    lastInteractionTimestampRef.current = currentTimestamp;

    if (isSessionActive) {
      logger.info('VoiceHub: manual user intervention captured. Discontinuing speech session recording.');
      onEndSession();
    } else {
      // One-time microphone/voice disclosure before the first recording (E2 consent).
      if (!hasMicConsent()) {
        setShowMicConsent(true);
        return;
      }
      logger.info('VoiceHub: manual user intervention captured. Launching speech session recording.');
      onStartSession();
    }
  }, [isSessionActive, status, onStartSession, onEndSession]);

  const handleMicConsentAccept = useCallback(() => {
    setMicConsent();
    setShowMicConsent(false);
    logger.info('VoiceHub: microphone consent acknowledged. Launching speech session recording.');
    onStartSession();
  }, [onStartSession]);

  const isProcessingActive = status === 'processing';

  return (
    <>
      {showMicConsent && (
        <MicConsentModal onAccept={handleMicConsentAccept} onCancel={() => setShowMicConsent(false)} />
      )}
    <div className="flex items-center justify-center" role="region" aria-label={t('workspace.voice.region')}>
      <button 
        onClick={handleButtonClick} 
        disabled={isProcessingActive}
        className={`w-11 h-11 flex items-center justify-center rounded-full transition-transform active:scale-95 duration-200 ${
          isProcessingActive ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        }`} 
        aria-label={t(isSessionActive ? 'workspace.voice.stop' : 'workspace.voice.start')}
        aria-busy={isProcessingActive}
        aria-live="polite"
      >
        <AnimatedStatusButton status={status} />
      </button>
    </div>
    </>
  );
}