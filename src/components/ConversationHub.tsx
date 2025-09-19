import { Download, Trash2 } from 'lucide-react';
import { AppStatus } from '../context/ConversationContext';
import { AnimatedStatusButton } from './AnimatedStatusButton';
import { UserSettings } from '../types/settings';

interface ConversationHubProps {
  readonly status: AppStatus;
  readonly isSessionActive: boolean;
  readonly sessionTime: number;
  readonly errorMessage: string | null;
  readonly onStartSession: () => void;
  readonly onEndSession: () => void;
  readonly onClearError: () => void;
  readonly onClearConversation: () => void;
  readonly onDownloadTranscript: () => void;
  readonly onOpenAppSettings: () => void;
  readonly onOpenAccountSettings: () => void;
  readonly userSettings: Partial<UserSettings>;
}

export function ConversationHub({
  status,
  isSessionActive,
  sessionTime,
  errorMessage,
  onStartSession,
  onEndSession,
  onClearConversation,
  onDownloadTranscript,
}: ConversationHubProps): JSX.Element {
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const statusMessage = () => {
    switch (status) {
      case 'idle': return 'Ready';
      case 'listening': return 'Listening...';
      case 'processing': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      case 'error': return `Error: ${errorMessage || 'Unknown error'}`;
      default: return 'Ready';
    }
  };

  const handleButtonClick = () => {
    if (isSessionActive) {
      onEndSession();
    } else {
      onStartSession();
    }
  };

  const statusColor = isSessionActive ? 'text-art-red-600' : 'text-immigo-gray-600';

  return (
    <div className="flex flex-col justify-center w-full h-full bg-star-white rounded-lg shadow-md p-6">
      <div>
        <div className="flex flex-col space-y-2">
          <button onClick={onClearConversation} className="flex items-center justify-center p-3 rounded-lg bg-immigo-gray-100 hover:bg-immigo-gray-200 text-sm font-medium text-art-red-600">
            <Trash2 className="w-4 h-4 mr-2" /> Clear Conversation
          </button>
          <button onClick={onDownloadTranscript} className="flex items-center justify-center p-3 rounded-lg bg-immigo-gray-100 hover:bg-immigo-gray-200 text-sm font-medium text-immigo-gray-700">
            <Download className="w-4 h-4 mr-2" /> Download Script
          </button>
        </div>

        <div className="my-8" />

        <div className="flex flex-col items-center space-y-4">
          <button onClick={handleButtonClick} className="w-48 h-48 flex items-center justify-center" aria-label={isSessionActive ? 'Stop Session' : 'Start Session'}>
              <AnimatedStatusButton status={status} />
          </button>
          <div className="text-center">
            <p className={`text-sm font-semibold capitalize ${status === 'error' ? 'text-art-red-600' : 'text-deep-navy'}`}>{statusMessage()}</p>
            <p className={`text-lg font-mono ${statusColor}`}>{formatTime(sessionTime)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}