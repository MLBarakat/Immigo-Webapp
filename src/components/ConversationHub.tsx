import React from 'react';
import { RefreshCcw, Pause, Play, Download } from 'lucide-react';
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

export const ConversationHub: React.FC<ConversationHubProps> = ({
  status,
  isSessionActive,
  sessionTime,
  errorMessage,
  onStartSession,
  onEndSession,
  onClearError,
  onClearConversation,
  onDownloadTranscript,
}) => {
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const statusMessage = () => {
    switch (status) {
      case 'idle': return 'Ready to start';
      case 'listening': return 'AI is listening...';
      case 'processing': return 'AI is thinking...';
      case 'speaking': return 'AI is speaking...';
      case 'error': return `Error: ${errorMessage}`;
      default: return 'Ready';
    }
  };

  const renderActionButton = () => {
    const buttonClasses = "w-24 h-24 text-white rounded-full flex items-center justify-center shadow-lg transition-all duration-300 transform hover:scale-110";
    if (isSessionActive) {
      return (
        <button
          onClick={onEndSession}
          className={`${buttonClasses} bg-art-red-600 hover:bg-art-red-700`}
          aria-label="End session"
        >
          <Pause className="w-10 h-10" />
        </button>
      );
    }
    return (
      <button
        onClick={onStartSession}
        className={`${buttonClasses} bg-art-blue-600 hover:bg-art-blue-700`}
        aria-label="Start session"
      >
        <Play className="w-10 h-10" />
      </button>
    );
  };

  return (
    <div className="flex flex-col w-full h-full bg-star-white rounded-2xl shadow-xl border border-immigo-gray-200 p-6 space-y-6">
      <div className="flex flex-col items-center justify-between space-y-4 flex-grow">
          <div className="flex flex-col items-center space-y-2">
            <button onClick={onClearConversation} className="flex items-center text-sm font-semibold text-immigo-gray-700 hover:text-deep-navy">
                <RefreshCcw className="w-4 h-4 mr-2" /> Clear Conversation
            </button>
            <button onClick={onDownloadTranscript} className="flex items-center text-sm font-semibold text-immigo-gray-700 hover:text-deep-navy">
                <Download className="w-4 h-4 mr-2" /> Download Transcript
            </button>
          </div>

          <div className="flex flex-col items-center justify-center space-y-4">
              {renderActionButton()}
              <div className="text-center">
                <p className={`text-lg font-semibold ${errorMessage ? 'text-art-red-600' : 'text-deep-navy'}`}>{statusMessage()}</p>
                <p className="text-sm text-immigo-gray-600">{formatTime(sessionTime)}</p>
                {errorMessage && (
                    <button onClick={onClearError} className="text-art-blue-600 text-sm mt-1">Clear Error</button>
                )}
              </div>
          </div>

          {/* Spacer to push content to top and bottom */}
          <div className="flex-grow" />
      </div>
    </div>
  );
};