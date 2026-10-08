import { Maximize2, Minimize2, Send, Timer } from 'lucide-react';
import { useState, KeyboardEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ConversationHistory } from './ConversationHistory';
import { VoiceHub } from './VoiceHub';
import { AppStatus, Message } from '../context/conversationContextTypes';
import { DisplayUser } from '../types/user';

interface CenterPanelProps {
  conversationHistory: readonly Message[];
  displayUser: DisplayUser;
  interimTranscript: string;
  appStatus: AppStatus;
  isSessionActive: boolean;
  sessionTime: number;
  errorMessage: string | null;
  hasMoreHistory: boolean;
  onSendMessage: (message: string) => void;
  onStartSession: () => void;
  onEndSession: () => void;
  onLoadOlder: () => void;
  onClearError: () => void;
  onToggleFocus?: () => void;
  isFocusMode?: boolean;
}

function formatTime(seconds: number): string {
  const abs = Math.max(0, Math.floor(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const STATUS_COLORS: Record<AppStatus, string> = {
  idle: 'text-immigo-gray-500',
  listening: 'text-green-600',
  processing: 'text-amber-600',
  speaking: 'text-art-blue-600',
  error: 'text-art-red-600',
};

const STATUS_DOT_COLORS: Record<AppStatus, string> = {
  idle: 'bg-immigo-gray-400',
  listening: 'bg-green-500 animate-pulse',
  processing: 'bg-amber-500 animate-pulse',
  speaking: 'bg-art-blue-500 animate-pulse',
  error: 'bg-art-red-600',
};

export function CenterPanel({
  conversationHistory,
  displayUser,
  interimTranscript,
  appStatus,
  isSessionActive,
  sessionTime,
  errorMessage,
  hasMoreHistory,
  onSendMessage,
  onStartSession,
  onEndSession,
  onLoadOlder,
  onClearError,
  onToggleFocus,
  isFocusMode = false,
}: CenterPanelProps) {
  const [message, setMessage] = useState('');
  const { t } = useTranslation('conversation');
  const statusLabelKeys: Record<AppStatus, string> = {
    idle: 'workspace.center.status.ready',
    listening: 'workspace.center.status.listening',
    processing: 'workspace.center.status.thinking',
    speaking: 'workspace.center.status.speaking',
    error: 'workspace.center.status.error',
  };

  const handleSend = () => {
    const text = message.trim();
    if (text && appStatus !== 'processing' && appStatus !== 'speaking') {
      onSendMessage(text);
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  const isEmpty = !message.trim();

  return (
    <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-immigo-gray-50">
      {/* Center Panel Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-star-white border-b border-immigo-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg" aria-hidden="true">🏛</span>
          <div>
            <h1 className="text-sm font-bold text-deep-navy leading-tight">{t('workspace.center.title')}</h1>
            <p className="text-[11px] text-immigo-gray-500 leading-tight">{t('workspace.center.subtitle')}</p>
          </div>
        </div>

        {/* Status + Timer */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[appStatus]}`} />
            <span className={`text-xs font-semibold transition-colors duration-200 ${STATUS_COLORS[appStatus]}`}>
              {t(statusLabelKeys[appStatus])}
            </span>
          </div>

          {/* Timer */}
          {isSessionActive && (
            <div className="flex items-center gap-1.5 bg-immigo-gray-100 rounded-lg px-3 py-1.5">
              <Timer className="w-3.5 h-3.5 text-immigo-gray-600" />
              <span className="text-xs font-mono font-bold text-deep-navy tabular-nums">{formatTime(sessionTime)}</span>
            </div>
          )}
          {onToggleFocus && (
            <button
              type="button"
              onClick={onToggleFocus}
              className="hidden md:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-immigo-gray-600 hover:bg-immigo-gray-100 focus:outline-none focus:ring-2 focus:ring-art-blue-500"
              aria-label={t(isFocusMode ? 'workspace.center.exitFocusAria' : 'workspace.center.enterFocusAria')}
              title={t('workspace.center.focusTitle')}
            >
              {isFocusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span>{t(isFocusMode ? 'workspace.center.exitFocus' : 'workspace.center.focus')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mx-6 mt-3 p-3 bg-art-red-50 border-l-4 border-art-red-600 rounded text-sm text-art-red-800 flex justify-between items-center shrink-0" role="alert">
          <p className="font-medium">{errorMessage}</p>
          <button onClick={onClearError} className="text-xs underline hover:text-art-red-900 cursor-pointer ml-4 shrink-0">{t('workspace.center.dismiss')}</button>
        </div>
      )}

      {/* Conversation Area */}
      <div className="flex-1 overflow-hidden min-h-0">
        {conversationHistory.length > 0 || interimTranscript ? (
          <ConversationHistory
            messages={conversationHistory}
            displayUser={displayUser}
            interimTranscript={interimTranscript}
            onLoadOlder={onLoadOlder}
            hasMore={hasMoreHistory}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-full bg-art-blue-50 border-2 border-art-blue-100 flex items-center justify-center mb-4">
              <span className="text-2xl">🏛</span>
            </div>
            <h2 className="text-base font-bold text-deep-navy mb-2">{t('workspace.center.readyToPractice')}</h2>
            <p className="text-sm text-immigo-gray-500 max-w-xs leading-relaxed">
              {t('workspace.center.readyDescription')}
            </p>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0 bg-star-white border-t border-immigo-gray-200">
        <div className="flex items-end gap-3 px-4 py-3">
          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              rows={1}
              className="w-full px-4 py-3 pr-4 border-2 border-immigo-gray-200 rounded-xl resize-none focus:outline-none focus:border-art-blue-500 disabled:bg-immigo-gray-50 disabled:cursor-not-allowed text-sm text-deep-navy placeholder-immigo-gray-400 transition-colors duration-150"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
              placeholder={t('workspace.center.inputPlaceholder')}
              value={message}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              disabled={!isSessionActive || appStatus === 'processing' || appStatus === 'speaking'}
              aria-label={t('workspace.center.inputAria')}
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={isEmpty || !isSessionActive || appStatus === 'processing' || appStatus === 'speaking'}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-art-blue-600 text-star-white hover:bg-art-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shrink-0 shadow-sm hover:shadow-md active:scale-95"
            aria-label={t('workspace.center.send')}
          >
            <Send className="w-4 h-4" />
          </button>

          {/* Mic / Voice Hub */}
          <div className="shrink-0">
            <VoiceHub
              status={appStatus}
              isSessionActive={isSessionActive}
              onStartSession={onStartSession}
              onEndSession={onEndSession}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
