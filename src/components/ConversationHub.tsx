import React from 'react';
import { Mic, StopCircle, Waves, Loader, AlertCircle } from 'lucide-react';
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
  idle: { label: 'Ready' },
  listening: { label: 'Listening...' },
  processing: { label: 'Processing...' },
  speaking: { label: 'AI Speaking...' },
  error: { label: 'Error' },
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
          className="w-32 h-32 flex flex-col items-center justify-center rounded-full bg-art-red-600 text-star-white shadow-xl transform hover:scale-105 transition-all"
          aria-label="End Conversation"
        >
          <StopCircle className="w-16 h-16" />
          <span className="mt-1 text-sm font-bold">End</span>
        </button>
      );
    }
    return (
      <button
        onClick={onStartSession}
        className="w-32 h-32 flex flex-col items-center justify-center rounded-full bg-art-blue-600 text-star-white shadow-xl transform hover:scale-105 transition-all"
        aria-label="Start Conversation"
      >
        <Mic className="w-16 h-16" />
        <span className="mt-1 text-sm font-bold">Start</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-star-white shadow-xl border rounded-2xl h-full space-y-6">
      <div className="text-center">
        <p className={`text-xl font-semibold ${status === 'error' ? 'text-art-red-600' : 'text-deep-navy'}`}>
          {status === 'error' ? errorMessage : config.label}
        </p>
        {isSessionActive && (
          <p className="text-lg text-immigo-gray-600 font-mono mt-1">
            {formatTime(sessionTime)}
          </p>
        )}
      </div>

      <ActionButton />

      {status === 'error' && (
         <button
            onClick={onClearError}
            className="mt-4 px-4 py-2 bg-immigo-gray-600 text-star-white text-sm font-bold rounded-lg hover:bg-immigo-gray-700"
          >
            Clear Error & Reset
          </button>
      )}
    </div>
  );
};