import { useEffect, useRef } from 'react';
import { Message } from '../types/conversation';
import { DisplayUser } from '../types/user';
import ImmigoLogo from '../assets/immigo_logo.png';

interface ConversationHistoryProps {
  messages: readonly Message[];
  displayUser: DisplayUser;
  interimTranscript: string;
}

export function ConversationHistory({ messages, displayUser, interimTranscript }: ConversationHistoryProps): JSX.Element {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, interimTranscript]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {messages.map((msg) => (
        <div key={msg.id} className={`flex items-start gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          {msg.role === 'assistant' && (
            <img src={ImmigoLogo} alt="AI Avatar" className="w-10 h-10 rounded-full border border-immigo-gray-200" />
          )}
          <div
            className={`max-w-[70%] p-3 rounded-xl shadow-sm ${
              msg.role === 'user'
                ? 'bg-immigo-gray-200 text-deep-navy rounded-bl-none'
                : 'bg-art-blue-600 text-star-white rounded-br-none'
            }`}
          >
            <p className="text-sm">{msg.content}</p>
          </div>
          {msg.role === 'user' && (
            <div className="w-10 h-10 rounded-full bg-art-blue-600 text-star-white flex items-center justify-center font-bold flex-shrink-0">
              {displayUser.initials}
            </div>
          )}
        </div>
      ))}
      {interimTranscript && (
          <div className="flex items-start gap-4 justify-end">
            <div className="max-w-[70%] p-3 rounded-xl shadow-sm bg-immigo-gray-200 text-deep-navy rounded-br-none opacity-70 italic">
                <p className="text-sm">{interimTranscript}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-art-blue-600 text-star-white flex items-center justify-center font-bold flex-shrink-0 animate-pulse">
                {displayUser.initials}
            </div>
          </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
