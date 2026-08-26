import { useRef, useCallback, useState } from 'react';
import { AppStatus } from '../context/conversationContextTypes';
import { AnimatedStatusButton } from './AnimatedStatusButton';
import { logger } from '../logger';
import { MicConsentModal } from './MicConsentModal';
import { hasMicConsent, setMicConsent } from '../utils/micConsent';

interface VoiceHubProps {
  readonly status: AppStatus;
  readonly isSessionActive: boolean;
  readonly sessionTime: number;
  readonly onStartSession: () => void;
  readonly onEndSession: () => void;
}

export function VoiceHub({ 
  status, 
  isSessionActive, 
  sessionTime, 
  onStartSession, 
  onEndSession 
}: VoiceHubProps): JSX.Element {
  
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

  const formatTime = (seconds: number): string => {
    const absoluteSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(absoluteSeconds / 60);
    const remainingSeconds = absoluteSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const statusMessage = (): string => {
    switch (status) {
      case 'idle': return 'Ready';
      case 'listening': return 'Listening';
      case 'processing': return 'Thinking...';
      case 'speaking': return 'Speaking';
      case 'error': return 'System Error';
      default: return 'Ready';
    }
  };

  const statusColor = isSessionActive ? 'text-art-red-600' : 'text-immigo-gray-600';
  const isProcessingActive = status === 'processing';

  return (
    <>
      {showMicConsent && (
        <MicConsentModal onAccept={handleMicConsentAccept} onCancel={() => setShowMicConsent(false)} />
      )}
    <div className="flex flex-col items-center justify-center pl-2" role="region" aria-label="Voice Interaction Hub">
      <button 
        onClick={handleButtonClick} 
        disabled={isProcessingActive}
        className={`w-12 h-12 flex items-center justify-center transition-transform active:scale-95 duration-200 ${
          isProcessingActive ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        }`} 
        aria-label={isSessionActive ? 'Stop Voice Recording Session' : 'Start Voice Recording Session'}
        aria-busy={isProcessingActive}
        aria-live="polite"
      >
        <AnimatedStatusButton status={status} />
      </button>
      
      {/* Enforce ARIA Live parameters to ensure accessibility tools announce changes smoothly */}
      <div className="text-center mt-1" aria-live="polite" id="asr-status-ledger">
        <p 
          className={`text-xs font-semibold capitalize transition-colors duration-150 ${
            status === 'error' ? 'text-art-red-600' : 'text-deep-navy'
          }`}
          role="status"
        >
          {statusMessage()}
        </p>
        <p className={`text-sm font-mono transition-colors duration-150 ${statusColor}`}>
          {formatTime(sessionTime)}
        </p>
      </div>
    </div>
    </>
  );
}