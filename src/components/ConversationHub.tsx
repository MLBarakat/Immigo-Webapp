import React from 'react';
import { RefreshCcw, Pause, Play, Download, Settings, UserCircle2, MessageSquare, Mic } from 'lucide-react';
import { AppStatus } from '../context/ConversationContext';
import { ApiClient } from '../services/apiClient';
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
  apiClient: ApiClient | null;
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
  onOpenAppSettings,
  onOpenAccountSettings,
  apiClient,
  userSettings,
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
    }
  };

  const renderActionButton = () => {
    if (isSessionActive) {
      return (
        <button
          onClick={onEndSession}
          className="bg-art-red-600 hover:bg-art-red-700 text-white rounded-full p-4 flex items-center justify-center shadow-lg transition-all duration-200"
          aria-label="End session"
        >
          <Pause className="w-7 h-7" />
        </button>
      );
    }
    return (
      <button
        onClick={onStartSession}
        className="bg-art-blue-600 hover:bg-art-blue-700 text-white rounded-full p-4 flex items-center justify-center shadow-lg transition-all duration-200"
        aria-label="Start session"
      >
        <Play className="w-7 h-7" />
      </button>
    );
  };

  return (
    <div className="flex flex-col w-full h-full bg-star-white rounded-2xl shadow-xl border border-immigo-gray-200 p-6 space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-deep-navy font-display">Conversation Hub</h2>
        <p className={`text-sm ${errorMessage ? 'text-art-red-600' : 'text-immigo-gray-600'}`}>{statusMessage()}</p>
        {errorMessage && (
            <button onClick={onClearError} className="text-art-blue-600 text-sm mt-1">Clear Error</button>
        )}
      </div>

      <div className="flex justify-center items-center my-4">
        {renderActionButton()}
      </div>

      <div className="flex justify-around text-center border-t border-b border-immigo-gray-200 py-4">
        <div>
          <p className="text-lg font-semibold text-deep-navy">{formatTime(sessionTime)}</p>
          <p className="text-sm text-immigo-gray-600">Session Time</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-deep-navy">EN</p> {/* Placeholder for language */}
          <p className="text-sm text-immigo-gray-600">Language</p>
        </div>
      </div>

      <div className="flex-1 space-y-3">
        {/* Placeholder for future features like "Session Summary" or "AI Insights" */}
        <div className="flex items-center text-immigo-gray-700">
            <MessageSquare className="w-5 h-5 mr-2" />
            <span className="text-sm">Talk about anything...</span>
        </div>
        <div className="flex items-center text-immigo-gray-700">
            <Mic className="w-5 h-5 mr-2" />
            <span className="text-sm">Mic Mode: {userSettings.mic_mode === 'push_to_talk' ? 'Push-to-Talk' : 'Voice Activity'}</span>
        </div>
        <div className="flex items-center text-immigo-gray-700">
            <RefreshCcw className="w-5 h-5 mr-2" />
            <span className="text-sm">Interruption: {userSettings.barge_in || 'Balanced'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm font-medium text-deep-navy border-t border-immigo-gray-200 pt-4">
        <button onClick={onClearConversation} className="flex items-center justify-center p-2 rounded-lg hover:bg-immigo-gray-100 transition-colors">
          <RefreshCcw className="w-4 h-4 mr-2" /> Clear
        </button>
        <button onClick={onDownloadTranscript} className="flex items-center justify-center p-2 rounded-lg hover:bg-immigo-gray-100 transition-colors">
          <Download className="w-4 h-4 mr-2" /> Transcript
        </button>
        <button onClick={onOpenAppSettings} className="flex items-center justify-center p-2 rounded-lg hover:bg-immigo-gray-100 transition-colors">
          <Settings className="w-4 h-4 mr-2" /> App Settings
        </button>
        <button onClick={onOpenAccountSettings} className="flex items-center justify-center p-2 rounded-lg hover:bg-immigo-gray-100 transition-colors">
          <UserCircle2 className="w-4 h-4 mr-2" /> Account
        </button>
      </div>
    </div>
  );
};