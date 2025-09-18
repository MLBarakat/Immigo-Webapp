import { Download, Mic, StopCircle, Trash2 } from 'lucide-react';
import { AppStatus } from '../context/ConversationContext';
import { UserSettings } from '../types/settings';

interface ConversationHubProps {
  status: AppStatus;
  isSessionActive: boolean;
  sessionTime: number;
  errorMessage: string | null;
  onStartSession: () => void;
  onEndSession: () => void;
  onClearError: () => void;
  onClearConversation: () => void;
  onDownloadTranscript: () => void;
  onOpenAppSettings: () => void;
  onOpenAccountSettings: () => void;
  userSettings: Partial<UserSettings>;
}

export function ConversationHub({
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

  const statusMessage = isSessionActive ? "Session Live" : "Session Ready";
  const statusColor = isSessionActive ? 'text-art-red-600' : 'text-immigo-gray-600';

  return (
    <div className="flex flex-col w-full h-full bg-star-white rounded-lg shadow-md p-6 space-y-6">
      <div className="flex flex-col space-y-2">
        <button onClick={onClearConversation} className="flex items-center justify-center p-3 rounded-lg hover:bg-immigo-gray-100 text-sm font-medium text-immigo-gray-700">
          <Trash2 className="w-4 h-4 mr-2" /> Clear Conversation
        </button>
        <button onClick={onDownloadTranscript} className="flex items-center justify-center p-3 rounded-lg hover:bg-immigo-gray-100 text-sm font-medium text-immigo-gray-700">
          <Download className="w-4 h-4 mr-2" /> Download Script
        </button>
      </div>

      <div className="flex-grow" />

      <div className="flex flex-col items-center space-y-4">
        <button
          onClick={isSessionActive ? onEndSession : onStartSession}
          className={`w-full h-20 rounded-xl text-xl font-bold flex items-center justify-center text-star-white shadow-lg transition-colors ${
            isSessionActive ? 'bg-art-red-600 hover:bg-art-red-700' : 'bg-art-blue-600 hover:bg-art-blue-700'
          }`}
        >
          {isSessionActive ? (
            <><StopCircle className="w-6 h-6 mr-3" /> Stop Conversation</>
          ) : (
            <><Mic className="w-6 h-6 mr-3" /> Start Conversation</>
          )}
        </button>
        <div className="text-center">
          <p className={`text-sm font-semibold ${statusColor}`}>{statusMessage}</p>
          <p className="text-lg font-mono text-deep-navy">{formatTime(sessionTime)}</p>
          {errorMessage && (
            <p className="text-xs text-art-red-600 mt-1">{errorMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}