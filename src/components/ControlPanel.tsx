import React from 'react';
import { Play, Square, RotateCcw, Mic } from 'lucide-react';
import { AppStatus } from '../types/conversation';

interface ControlPanelProps {
  status: AppStatus;
  isSessionActive: boolean;
  onStartSession: () => void;
  onEndSession: () => void;
  onClearError: () => void;
}

export function ControlPanel({
  status,
  isSessionActive,
  onStartSession,
  onEndSession,
  onClearError,
}: ControlPanelProps) {
  return (
    <div className="flex flex-col items-center space-y-6 p-8 bg-gradient-to-t from-slate-50 to-white border-t border-slate-200">
      <div className="flex space-x-6">
        {!isSessionActive ? (
          <button
            onClick={onStartSession}
            disabled={status === 'processing'}
            className="group flex items-center space-x-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
          >
            <div className="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center group-hover:bg-opacity-30 transition-all duration-300">
              <Play className="w-4 h-4 ml-0.5" />
            </div>
            <span className="text-lg">Start Conversation</span>
          </button>
        ) : (
          <button
            onClick={onEndSession}
            className="group flex items-center space-x-3 px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl font-semibold hover:from-red-700 hover:to-red-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
          >
            <div className="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center group-hover:bg-opacity-30 transition-all duration-300">
              <Square className="w-4 h-4" />
            </div>
            <span className="text-lg">End Conversation</span>
          </button>
        )}

        {status === 'error' && (
          <button
            onClick={onClearError}
            className="group flex items-center space-x-2 px-6 py-4 bg-white text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all duration-300 shadow-md hover:shadow-lg border border-slate-200 transform hover:scale-105 active:scale-95"
          >
            <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
            <span>Retry</span>
          </button>
        )}
      </div>

      <div className="text-center max-w-lg">
        {!isSessionActive ? (
          <div className="space-y-2">
            <p className="text-lg font-medium text-slate-700">Ready to Begin</p>
            <p className="text-slate-500">Click "Start Conversation" to begin voice chat with AI</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-center space-x-2 text-blue-700">
              <Mic className="w-5 h-5" />
              <p className="text-lg font-medium">Listening...</p>
            </div>
            <p className="text-slate-500">Speak naturally or say "stop" to end the conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}