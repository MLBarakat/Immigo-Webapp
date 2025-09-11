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
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {messages.map((msg, index) => (
        <div key={index} className={`flex items-start gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
          {msg.role === 'assistant' && (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-patriot-blue-500 to-patriot-blue-700 flex items-center justify-center text-white shadow-md">
              <Bot size={24} />
            </div>
          )}
          <div
            className={`max-w-md p-4 rounded-2xl shadow-lg ${
              msg.role === 'user'
                ? 'bg-patriot-blue-600 text-white rounded-br-none'
                : 'bg-white text-patriot-gray-800 rounded-bl-none border border-patriot-gray-200'
            }`}
          >
            <p className="text-sm">{msg.content}</p>
            <p className="text-xs mt-2 opacity-70 text-right">{new Date(msg.timestamp).toLocaleTimeString()}</p>
          </div>
          {msg.role === 'user' && (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-patriot-gray-300 to-patriot-gray-500 flex items-center justify-center text-white shadow-md">
              <User size={24} />
            </div>
          )}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};