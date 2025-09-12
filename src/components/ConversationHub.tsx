import React from 'react';
import { Mic, StopCircle, Waves, Volume2, Loader, AlertCircle } from 'lucide-react';
import { AppStatus } from '../types/conversation';

interface ConversationHubProps {
  status: AppStatus;
  isSessionActive: boolean;
  sessionTime: number;
  errorMessage: string | null;
  onStartSession: () => void;
  onEndSession: () => void;
  onClearError: () => void;
}

const statusConfig = {
  idle: { icon: Mic, label: 'Ready to talk' },
  listening: { icon: Waves, label: 'Listening...', animated: true },
  processing: { icon: Loader, label: 'Processing...', animated: true },
  speaking: { icon: Volume2, label: 'AI is speaking...', animated: true },
  error: { icon: AlertCircle, label: 'Error' },
};

export const ConversationHub: React.FC<ConversationHubProps> = ({
  status,
  isSessionActive,
  sessionTime,
  errorMessage,
  onStartSession,
  onEndSession,
  onClearError,
}) => {
  const config = statusConfig[status];
  const IconComponent = config.icon;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const ActionButton = () => {
    if (isSessionActive) {
      return (
        <button
          onClick={onEndSession}
          className="w-24 h-24 flex items-center justify-center rounded-full bg-art-red-600 text-star-white shadow-xl transform hover:scale-105 transition-all"
        >
          <StopCircle className="w-12 h-12" />
        </button>
      );
    }
    return (
      <button
        onClick={onStartSession}
        className="w-24 h-24 flex items-center justify-center rounded-full bg-art-blue-600 text-star-white shadow-xl transform hover:scale-105 transition-all"
      >
        <Mic className="w-12 h-12" />
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-t from-immigo-gray-50 to-star-white border-t-2 border-immigo-gray-200 shadow-inner space-y-4">
      <div className="text-center h-12">
        <p className={`text-lg font-semibold ${status === 'error' ? 'text-art-red-600' : 'text-deep-navy'}`}>
          {status === 'error' ? errorMessage : config.label}
        </p>
        {isSessionActive && (
          <p className="text-sm text-immigo-gray-600 font-mono">
            Session Time: {formatTime(sessionTime)}
          </p>
        )}
      </div>

      <ActionButton />

      {status === 'error' && (
         <button
            onClick={onClearError}
            className="mt-2 px-4 py-2 bg-immigo-gray-600 text-star-white text-sm font-bold rounded-lg hover:bg-immigo-gray-700"
          >
            Clear Error
          </button>
      )}
    </div>
  );
};