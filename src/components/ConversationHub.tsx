import React from 'react';
import { Mic, StopCircle, Download, Trash2 } from 'lucide-react';
import { AppStatus } from '../types/conversation';

// Props are updated to remove voice selection, as it's now in the App Settings modal
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
  onClearConversation,
  onDownloadTranscript,
}) => {
  const config = statusConfig[status];

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const ActionButton = ({ isMobile = false }) => {
    const sizeClass = isMobile ? 'w-16 h-16' : 'w-32 h-32';
    const iconSize = isMobile ? 'w-8 h-8' : 'w-16 h-16';

    if (isSessionActive) {
      return (
        <button
          onClick={onEndSession}
          className={`${sizeClass} flex flex-col items-center justify-center rounded-full bg-art-red-600 text-star-white shadow-xl transform hover:scale-105 transition-all`}
          aria-label="End Conversation"
        >
          <StopCircle className={iconSize} />
          <span className={`mt-1 text-sm font-bold ${isMobile ? 'hidden' : 'block'}`}>End</span>
        </button>
      );
    }
    return (
      <button
        onClick={onStartSession}
        className={`${sizeClass} flex flex-col items-center justify-center rounded-full bg-art-blue-600 text-star-white shadow-xl transform hover:scale-105 transition-all`}
        aria-label="Start Conversation"
      >
        <Mic className={iconSize} />
        <span className={`mt-1 text-sm font-bold ${isMobile ? 'hidden' : 'block'}`}>Start</span>
      </button>
    );
  };

  return (
    <>
        {/* Desktop Sidebar View */}
        <aside className="hidden lg:flex flex-col p-6 bg-star-white shadow-xl border rounded-2xl h-full">
            <div className="flex-shrink-0">
                <div className="space-y-2">
                    <button onClick={onClearConversation} className="w-full flex items-center p-2 rounded-lg hover:bg-immigo-gray-100" title="Clear Conversation">
                        <Trash2 className="w-5 h-5 text-immigo-gray-600 mr-2" /> Clear Conversation
                    </button>
                    <button onClick={onDownloadTranscript} className="w-full flex items-center p-2 rounded-lg hover:bg-immigo-gray-100" title="Download Transcript">
                        <Download className="w-5 h-5 text-immigo-gray-600 mr-2" /> Download Script
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-end">
                <ActionButton />
                <div className="text-center mt-4">
                    <p className={`text-xl font-semibold ${status === 'error' ? 'text-art-red-600' : 'text-deep-navy'}`}>
                        {status === 'error' ? errorMessage : config.label}
                    </p>
                    {isSessionActive && (
                        <p className="text-lg text-immigo-gray-600 font-mono mt-1">
                            {formatTime(sessionTime)}
                        </p>
                    )}
                </div>
                {status === 'error' && (
                    <button onClick={onClearError} className="mt-4 px-4 py-2 bg-immigo-gray-600 text-star-white text-sm font-bold rounded-lg hover:bg-immigo-gray-700">
                        Clear Error
                    </button>
                )}
            </div>
        </aside>

        {/* Mobile Voice Hub */}
        <div className="lg:hidden flex flex-col items-center justify-center pl-2 flex-shrink-0">
            <ActionButton isMobile={true} />
            <div className="text-center mt-1">
                <p className={`text-xs font-semibold ${status === 'error' ? 'text-art-red-600' : 'text-deep-navy'}`}>
                    {status === 'error' ? "Error" : config.label}
                </p>
                {isSessionActive && (
                    <p className="text-xs text-immigo-gray-600 font-mono">
                        {formatTime(sessionTime)}
                    </p>
                )}
            </div>
        </div>
    </>
  );
};