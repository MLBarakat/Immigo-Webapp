import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Message, MessageAction } from '../context/conversationContextTypes';
import { DisplayUser } from '../types/user';
import ImmigoLogo from '../assets/immigo_logo.png';

interface ConversationHistoryProps {
  messages: readonly Message[];
  displayUser: DisplayUser;
  interimTranscript: string;
  onLoadOlder?: () => void;
  hasMore?: boolean;
  onUserScroll?: () => void;
  onOpenExamReview?: (examId: string) => void;
  onMessageAction?: (messageId: string, action: MessageAction) => void;
}

export function ConversationHistory({
  messages,
  displayUser,
  interimTranscript,
  onLoadOlder,
  hasMore = false,
  onUserScroll,
  onOpenExamReview,
  onMessageAction,
}: ConversationHistoryProps): JSX.Element {
  const { t, i18n } = useTranslation('conversation');
  const conversationRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const previousLastMessageRef = useRef<{ id: string; content: string } | null>(null);
  const previousFirstIdRef = useRef<string | null>(null);
  const previousHeightRef = useRef<number>(0);
  const lastMessage = messages.at(-1) ?? null;
  const firstMessage = messages.at(0) ?? null;

  useLayoutEffect(() => {
    const viewport = conversationRef.current;
    const hasNewLatestMessage = lastMessage?.id !== previousLastMessageRef.current?.id
      || lastMessage?.content !== previousLastMessageRef.current?.content;
    const prependedOlder = firstMessage && previousFirstIdRef.current !== null
      && firstMessage.id !== previousFirstIdRef.current
      && !hasNewLatestMessage;
    if (viewport && prependedOlder) {
      // Infinite-scroll prepend: keep the user's viewport anchored instead
      // of yanking content down. User controls scrolling.
      viewport.scrollTop += viewport.scrollHeight - previousHeightRef.current;
    } else if (hasNewLatestMessage || interimTranscript) {
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
    previousLastMessageRef.current = lastMessage
      ? { id: lastMessage.id, content: lastMessage.content }
      : null;
    previousFirstIdRef.current = firstMessage?.id ?? null;
    if (viewport) previousHeightRef.current = viewport.scrollHeight;
  }, [lastMessage, firstMessage, interimTranscript]);

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
    <div
      ref={conversationRef}
      className="h-full min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 pt-14 pb-5 space-y-5 sm:px-6"
      role="log"
      data-testid="conversation-history-log"
      aria-label={t('workspace.center.conversationAria')}
      onWheel={onUserScroll}
      onTouchMove={onUserScroll}
    >
      {/* Top Sentinel for Infinite Scroll Upward */}
      <div ref={topSentinelRef} className="h-1 w-full">
        {hasMore && <span className="text-xs text-immigo-gray-400 italic flex justify-center py-1">{t('workspace.center.loadingOlder')}</span>}
      </div>

      {messages.map((msg, index) => {
        const messageDate = new Date(msg.timestamp);
        const previousDate = index > 0 ? new Date(messages[index - 1].timestamp) : null;
        const dateKey = messageDate.toDateString();
        const previousDateKey = previousDate?.toDateString();
        const startsNewDay = index === 0 || dateKey !== previousDateKey;
        const examReviewMatch = msg.role === 'assistant' ? /^\[\[MOCK_EXAM_REVIEW:([0-9a-f-]+)\]\]$/i.exec(msg.content) : null;

        return (
          <div key={msg.id}>
            {startsNewDay && (
              <div className="my-5 flex items-center gap-3" role="separator">
                <span className="h-px flex-1 bg-immigo-gray-200" />
                <time
                  dateTime={messageDate.toISOString()}
                  className="rounded-full border border-immigo-gray-200 bg-star-white px-3 py-1 text-[11px] font-semibold text-immigo-gray-500 shadow-sm"
                >
                  {messageDate.toLocaleDateString(i18n.language, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </time>
                <span className="h-px flex-1 bg-immigo-gray-200" />
              </div>
            )}
            <div className={`flex items-end gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
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
                {examReviewMatch ? (
                  <div className="min-w-[220px] space-y-2" data-testid="mock-exam-review-card">
                    <p className="font-semibold text-deep-navy">{t('workspace.examReview.cardTitle')}</p>
                    <p className="text-xs text-immigo-gray-600">{t('workspace.examReview.cardDescription')}</p>
                    <button
                      type="button"
                      onClick={() => onOpenExamReview?.(examReviewMatch[1])}
                      disabled={!onOpenExamReview}
                      className="rounded-lg bg-art-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-art-blue-700 disabled:opacity-60"
                    >
                      {t('workspace.examReview.openReview')}
                    </button>
                  </div>
                ) : <p className="whitespace-pre-wrap">{msg.content}</p>}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-testid="message-actions">
                    {msg.actions.map(action => (
                      <button
                        key={`${action.kind}-${action.examAction}`}
                        type="button"
                        onClick={() => onMessageAction?.(msg.id, action)}
                        disabled={!onMessageAction}
                        className={
                          action.variant === 'secondary'
                            ? 'rounded-lg border border-immigo-gray-300 px-4 py-2 text-sm font-semibold text-deep-navy transition hover:bg-immigo-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-white dark:hover:bg-gray-700'
                            : 'rounded-lg bg-art-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-art-blue-700 disabled:cursor-not-allowed disabled:opacity-60'
                        }
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
                <p className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-immigo-gray-300' : 'text-immigo-gray-400'}`}>
                  {messageDate.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        );
      })}

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

    </div>
  );
}

