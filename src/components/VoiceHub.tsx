import React from 'react';
import { Mic, StopCircle } from 'lucide-react';

interface VoiceHubProps {
  isSessionActive: boolean;
  sessionTime: number;
  onStartSession: () => void;
  onEndSession: () => void;
}

export const VoiceHub: React.FC<VoiceHubProps> = ({ isSessionActive, sessionTime, onStartSession, onEndSession }) => {
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const statusMessage = isSessionActive ? "Session Live" : "Session Ready";
  const statusColor = isSessionActive ? 'text-art-red-600' : 'text-immigo-gray-600';

  return (
    <div className="flex flex-col items-center justify-center pl-4">
      <button
        onClick={isSessionActive ? onEndSession : onStartSession}
        className={`w-16 h-16 rounded-full flex items-center justify-center text-star-white shadow-lg transition-colors ${
          isSessionActive ? 'bg-art-red-600 hover:bg-art-red-700' : 'bg-art-blue-600 hover:bg-art-blue-700'
        }`}
      >
        {isSessionActive ? <StopCircle className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
      </button>
      <div className="text-center mt-2">
        <p className={`text-xs font-semibold ${statusColor}`}>{statusMessage}</p>
        <p className="text-sm font-mono text-deep-navy">{formatTime(sessionTime)}</p>
      </div>
    </div>
  );
};