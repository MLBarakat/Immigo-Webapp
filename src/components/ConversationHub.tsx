import React from 'react';
import { Mic, Pause, Square, WifiOff, Volume2, VolumeX, AlertCircle, Timer } from 'lucide-react';
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

export const ConversationHub: React.FC<ConversationHubProps> = ({
  status,
  isSessionActive,
  sessionTime,
  errorMessage,
  onStartSession,
  onEndSession,
  onClearError,
}) => {
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const renderStatusIcon = () => {
    switch (status) {
      case 'listening': return <Mic className="w-6 h-6 text-white" />;
      case 'processing': return <Volume2 className="w-6 h-6 text-white" />;
      case 'speaking': return <Volume2 className="w-6 h-6 text-white" />;
      case 'error': return <AlertCircle className="w-6 h-6 text-white" />;
      case 'idle':
      default: return <VolumeX className="w-6 h-6 text-white" />;
    }
  };

  const renderStatusMessage = () => {
    if (errorMessage) {
      return <span className="text-art-red-100 font-semibold">{errorMessage}</span>;
    }
    switch (status) {
      case 'listening': return <span className="text-immigo-gray-100 font-semibold">Listening...</span>;
      case 'processing': return <span className="text-immigo-gray-100 font-semibold">Thinking...</span>;
      case 'speaking': return <span className="text-immigo-gray-100 font-semibold">Speaking...</span>;
      case 'idle': return <span className="text-immigo-gray-400">Tap the mic to start.</span>;
      case 'error': return <span className="text-art-red-100 font-semibold">Error!</span>;
      default: return <span className="text-immigo-gray-400">Idle.</span>;
    }
  };

  const handleMainButtonClick = () => {
    if (errorMessage) {
      onClearError();
    } else if (isSessionActive) {
      onEndSession();
    } else {
      onStartSession();
    }
  };

  const mainButtonText = errorMessage ? "Clear Error" : (isSessionActive ? "End Session" : "Start Session");
  const mainButtonIcon = isSessionActive ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />;
  const mainButtonClass = errorMessage ? "bg-art-red-600 hover:bg-art-red-700" : "bg-art-blue-600 hover:bg-art-blue-700";

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-immigo-gray-900 text-white rounded-b-2xl shadow-inner mt-auto">
      {isSessionActive && (
        <div className="flex items-center text-sm mb-2 text-immigo-gray-300">
          <Timer className="w-4 h-4 mr-1" />
          <span>{formatTime(sessionTime)}</span>
        </div>
      )}
      <div className={`relative flex items-center justify-center w-24 h-24 rounded-full ${errorMessage ? 'bg-art-red-700' : 'bg-immigo-gray-700'} mb-4`}>
        {renderStatusIcon()}
      </div>
      <div className="text-center text-sm mb-4">
        {renderStatusMessage()}
      </div>
      <button
        onClick={handleMainButtonClick}
        className={`flex items-center justify-center px-6 py-3 rounded-full text-lg font-bold text-white transition-colors duration-200 ${mainButtonClass}`}
      >
        {mainButtonIcon}
        <span className="ml-2">{mainButtonText}</span>
      </button>
    </div>
  );
};