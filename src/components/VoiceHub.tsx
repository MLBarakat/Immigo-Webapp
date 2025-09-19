import { AppStatus } from '../context/ConversationContext';
import { AnimatedStatusButton } from './AnimatedStatusButton';

interface VoiceHubProps {
  readonly status: AppStatus;
  readonly isSessionActive: boolean;
  readonly sessionTime: number;
  readonly onStartSession: () => void;
  readonly onEndSession: () => void;
}

export function VoiceHub({ status, isSessionActive, sessionTime, onStartSession, onEndSession }: VoiceHubProps): JSX.Element {
    const handleButtonClick = () => {
        if (isSessionActive) {
            onEndSession();
        } else {
            onStartSession();
        }
    };

    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const statusMessage = () => {
        switch (status) {
            case 'idle': return 'Ready';
            case 'listening': return 'Listening';
            case 'processing': return 'Thinking';
            case 'speaking': return 'Speaking';
            case 'error': return 'Error';
            default: return 'Ready';
        }
    };

    const statusColor = isSessionActive ? 'text-art-red-600' : 'text-immigo-gray-600';

    return (
        <div className="flex flex-col items-center justify-center pl-2">
            <button onClick={handleButtonClick} className="flex items-center justify-center w-20 h-20">
                {/* Scaled down version for mobile */}
                <div className="transform scale-75">
                    <AnimatedStatusButton status={status} />
                </div>
            </button>
            <div className="text-center mt-1">
                <p className={`text-xs font-semibold capitalize ${status === 'error' ? 'text-art-red-600' : 'text-deep-navy'}`}>{statusMessage()}</p>
                <p className={`text-sm font-mono ${statusColor}`}>{formatTime(sessionTime)}</p>
            </div>
        </div>
    );
}