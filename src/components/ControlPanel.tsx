import React from 'react';
import { Mic, StopCircle, Redo2, XCircle } from 'lucide-react';
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
  const isListening = status === 'listening';
  const isSpeaking = status === 'speaking';
  const isProcessing = status === 'processing';
  const isError = status === 'error';

  const isStartButtonDisabled = !isIdle && !isError;
  const isEndButtonDisabled = !isSessionActive || isError;
  const isRetryButtonDisabled = !isError;

  return (
    <div className="p-6 bg-gradient-to-t from-patriot-blue-50 to-white border-t-2 border-patriot-blue-200 shadow-lg flex flex-col space-y-4">

      {isError && (
        <div className="bg-patriot-red-100 border border-patriot-red-400 text-patriot-red-800 px-4 py-3 rounded-lg relative shadow-sm">
          <div className="flex items-center space-x-2">
            <XCircle className="h-5 w-5" />
            <span className="block sm:inline font-semibold">An error occurred!</span>
          </div>
          <p className="text-sm mt-1">Please try again or check your connection.</p>
          <button
            onClick={onClearError}
            className="mt-3 w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-patriot-red-600 text-base font-medium text-white hover:bg-patriot-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-patriot-red-500 sm:text-sm transition ease-in-out duration-150"
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
            ? 'bg-patriot-gray-300 text-patriot-gray-600 cursor-not-allowed'
            : 'bg-patriot-blue-600 text-white hover:bg-patriot-blue-700 focus:outline-none focus:ring-4 focus:ring-patriot-blue-300 transform hover:scale-105 transition-all duration-200'
          }`}
      >
        <Mic className="h-6 w-6 mr-3" />
        {isListening ? 'Listening...' : isSpeaking ? 'AI Speaking...' : isProcessing ? 'Processing...' : 'Start Conversation'}
      </button>

      <button
        onClick={onEndSession}
        disabled={isEndButtonDisabled}
        className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-bold rounded-lg shadow-xl
          ${isEndButtonDisabled
            ? 'bg-patriot-gray-300 text-patriot-gray-600 cursor-not-allowed'
            : 'bg-patriot-red-600 text-white hover:bg-patriot-red-700 focus:outline-none focus:ring-4 focus:ring-patriot-red-300 transform hover:scale-105 transition-all duration-200'
          }`}
      >
        <StopCircle className="h-6 w-6 mr-3" />
        End Conversation
      </button>

      {/* Optionally, a retry button could be here for specific errors */}
      {/*
      <button
        onClick={() => { /* retry logic * / }}
        disabled={isRetryButtonDisabled}
        className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-bold rounded-lg shadow-xl
          ${isRetryButtonDisabled
            ? 'bg-patriot-gray-300 text-patriot-gray-600 cursor-not-allowed'
            : 'bg-patriot-green-600 text-white hover:bg-patriot-green-700 focus:outline-none focus:ring-4 focus:ring-patriot-green-300 transform hover:scale-105 transition-all duration-200'
          }`}
      >
        <Redo2 className="h-6 w-6 mr-3" />
        Retry Last Action
      </button>
      */}
    </div>
  );
};