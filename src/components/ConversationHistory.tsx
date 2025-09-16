import React, { useEffect, useRef } from 'react';
import { Message } from '../types/conversation';
import { Bot, User } from 'lucide-react';

interface ConversationHistoryProps {
  messages: Message[];
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  messages,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex-grow overflow-y-auto p-4 space-y-4 rounded-lg bg-immigo-gray-50 dark:bg-gray-900">
      {messages.map((msg) => (
        <div key={msg.id} className={`flex items-start gap-3 sm:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          {msg.role === 'assistant' && (
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-art-blue-600 flex items-center justify-center text-star-white shadow-md flex-shrink-0">
              <Bot size={20} />
            </div>
          )}
          <div
            className={`max-w-xs sm:max-w-md lg:max-w-lg p-3 sm:p-4 rounded-2xl shadow-md ${
              msg.role === 'user'
                ? 'bg-art-blue-600 text-star-white rounded-br-lg'
                : 'bg-star-white text-deep-navy rounded-bl-lg border border-immigo-gray-200'
            }`}
          >
            <p className="text-sm leading-relaxed">{msg.content}</p>
            <p className={`text-xs mt-2 text-right opacity-70 ${msg.role === 'user' ? 'text-immigo-gray-200' : 'text-immigo-gray-500'}`}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
          </div>
          {msg.role === 'user' && (
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-deep-navy flex items-center justify-center text-star-white shadow-md flex-shrink-0">
              <User size={20} />
            </div>
          )}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};