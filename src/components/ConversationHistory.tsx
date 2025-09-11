import React, { useEffect, useRef } from 'react';
import { User, Bot } from 'lucide-react';
import { Message } from '../types/conversation';

interface ConversationHistoryProps {
  messages: Message[];
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({ messages }) => {
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-6 bg-star-white">
      {messages.map((msg, index) => (
        <div key={index} className={`flex items-start gap-2 sm:gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
          {msg.role === 'assistant' && (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-art-blue-500 to-art-blue-700 flex items-center justify-center text-star-white shadow-md flex-shrink-0">
              <Bot size={24} />
            </div>
          )}
          <div
            className={`max-w-xs sm:max-w-md p-3 sm:p-4 rounded-2xl shadow-lg ${
              msg.role === 'user'
                ? 'bg-art-blue-600 text-star-white rounded-br-none'
                : 'bg-star-white text-deep-navy rounded-bl-none border border-immigo-gray-200'
            }`}
          >
            <p className="text-sm">{msg.content}</p>
            <p className="text-xs mt-2 text-immigo-gray-500 text-right">{new Date(msg.timestamp).toLocaleTimeString()}</p>
          </div>
          {msg.role === 'user' && (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-immigo-gray-300 to-immigo-gray-500 flex items-center justify-center text-star-white shadow-md flex-shrink-0">
              <User size={24} />
            </div>
          )}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};