import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Message } from '../context/conversationContextTypes';
import { DisplayUser } from '../types/user';
import ImmigoLogo from '../assets/immigo_logo.png';

interface ConversationHistoryProps {
  messages: readonly Message[];
  displayUser: DisplayUser;
  interimTranscript: string;
  onLoadOlder?: () => void;
  hasMore?: boolean;
}

export function ConversationHistory({
  messages,
  displayUser,
  interimTranscript,
  onLoadOlder,
  hasMore = false,
}: ConversationHistoryProps): JSX.Element {
  const { t, i18n } = useTranslation('conversation');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const isFirstRenderRef = useRef<boolean>(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isFirstRenderRef.current && messages.length > 0) {
      scrollToBottom();
      isFirstRenderRef.current = false;
    } else if (interimTranscript) {
      scrollToBottom();
    }
  }, [messages, interimTranscript]);

  useEffect(() => {
    if (!onLoadOlder || !hasMore || !topSentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadOlder(); },
      { threshold: 0.1 }
    );
    const target = topSentinelRef.current;
    observer.observe(target);
    return () => observer.unobserve(target);
  }, [onLoadOlder, hasMore]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5" role="log" aria-label={t('workspace.center.conversationAria')}>
      {/* Top Sentinel for Infinite Scroll Upward */}
      <div ref={topSentinelRef} className="h-1 w-full">
        {hasMore && <span className="text-xs text-immigo-gray-400 italic flex justify-center py-1">{t('workspace.center.loadingOlder')}</span>}
      </div>

      {messages.map((msg) => (
        <div key={msg.id} className={`flex items-end gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
          {/* Avatar */}
          {msg.role === 'assistant' ? (
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <img
                src={ImmigoLogo}
                alt={t('workspace.center.officer')}
                className="w-9 h-9 rounded-full border-2 border-art-blue-100 shadow-sm object-cover"
              />
              <span className="text-[9px] font-bold text-art-blue-600 uppercase tracking-wide">{t('workspace.center.officer')}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-deep-navy text-star-white flex items-center justify-center font-bold text-sm shadow-sm">
                {displayUser.initials}
              </div>
              <span className="text-[9px] font-bold text-immigo-gray-500 uppercase tracking-wide">{t('workspace.center.user')}</span>
            </div>
          )}

          {/* Bubble */}
          <div
            className={`max-w-[78%] px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-deep-navy text-star-white rounded-br-sm'
                : 'bg-star-white text-deep-navy rounded-bl-sm border border-immigo-gray-200'
            }`}
          >
            <p>{msg.content}</p>
            <p className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-immigo-gray-300' : 'text-immigo-gray-400'}`}>
              {new Date(msg.timestamp).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))}

      {/* Interim (live) transcript bubble */}
      {interimTranscript && (
        <div className="flex items-end gap-3 flex-row-reverse">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-deep-navy text-star-white flex items-center justify-center font-bold text-sm shadow-sm animate-pulse">
              {displayUser.initials}
            </div>
            <span className="text-[9px] font-bold text-immigo-gray-500 uppercase tracking-wide">{t('workspace.center.user')}</span>
          </div>
          <div className="max-w-[78%] px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed bg-deep-navy text-star-white rounded-br-sm opacity-60 italic">
            <p>{interimTranscript}</p>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
