import React from 'react';
import { Mic, StopCircle, XCircle } from 'lucide-react';
import { AppStatus } from '../context/ConversationContext';

interface ControlPanelProps {
  status: AppStatus;
  isSessionActive: boolean;
  onStartSession: () => void;
  onEndSession: () => void;
  onClearError: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  status,
  isSessionActive,
  onStartSession,
  onEndSession,
  onClearError,
}) => {
  const isIdle = status === 'idle' && !isSessionActive;
  const isError = status === 'error';

  const isStartButtonDisabled = !isIdle && !isError;
  const isEndButtonDisabled = !isSessionActive || isError;

  return (
    <div className="p-6 bg-gradient-to-t from-immigo-gray-50 to-star-white border-t-2 border-immigo-gray-200 shadow-inner flex flex-col space-y-4">

      {isError && (
        <div className="bg-art-red-50 border border-art-red-300 text-art-red-800 px-4 py-3 rounded-lg relative shadow-md">
          <div className="flex items-center space-x-2">
            <XCircle className="h-5 w-5 text-art-red-600" />
            <span className="block sm:inline font-semibold">An error occurred!</span>
          </div>
          <p className="text-sm mt-1">Please try again or check your connection.</p>
          <button
            onClick={onClearError}
            className="mt-3 w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-art-red-600 text-base font-medium text-star-white hover:bg-art-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-red-500 sm:text-sm transition ease-in-out duration-150"
          >
            Clear Error
          </button>
        </div>
      )}

      <button
        onClick={onStartSession}
        disabled={isStartButtonDisabled}
        className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-bold rounded-lg shadow-xl
          ${isStartButtonDisabled
            ? 'bg-immigo-gray-300 text-immigo-gray-600 cursor-not-allowed'
            : 'bg-art-blue-600 text-star-white hover:bg-art-blue-700 focus:outline-none focus:ring-4 focus:ring-art-blue-300 transform hover:scale-105 transition-all duration-200'
          }`}
      >
        <Mic className="h-6 w-6 mr-3" />
        {status === 'listening' ? 'Listening...' : status === 'speaking' ? 'AI Speaking...' : status === 'processing' ? 'Processing...' : 'Start Conversation'}
      </button>

      <button
        onClick={onEndSession}
        disabled={isEndButtonDisabled}
        className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-bold rounded-lg shadow-xl
          ${isEndButtonDisabled
            ? 'bg-immigo-gray-300 text-immigo-gray-600 cursor-not-allowed'
            : 'bg-art-red-600 text-star-white hover:bg-art-red-700 focus:outline-none focus:ring-4 focus:ring-art-red-300 transform hover:scale-105 transition-all duration-200'
          }`}
      >
        <StopCircle className="h-6 w-6 mr-3" />
        End Conversation
      </button>
    </div>
  );
};