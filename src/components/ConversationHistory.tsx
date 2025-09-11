import React from 'react';
import { User, Bot, Flag } from 'lucide-react';
import { Message } from '../types/conversation';

interface ConversationHistoryProps {
  messages: Message[];
}

export function ConversationHistory({ messages }: ConversationHistoryProps) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-4">
        <div className="w-16 h-16 bg-gradient-to-br from-red-500 via-white to-blue-600 rounded-full flex items-center justify-center shadow-lg">
          <Flag className="w-8 h-8 text-slate-700" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700 mb-2">Ready to Chat!</p>
          <p className="text-slate-500">Start a conversation to see messages here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-6 p-6 bg-gradient-to-b from-slate-50 to-white">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex items-start space-x-4 ${
            message.role === 'user' ? 'justify-end' : 'justify-start'
          }`}
        >
          {message.role === 'assistant' && (
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center shadow-md border-2 border-white">
              <Bot className="w-5 h-5 text-white" />
            </div>
          )}
          
          <div
            className={`max-w-xs lg:max-w-md px-5 py-3 rounded-2xl shadow-md transition-all duration-200 hover:shadow-lg ${
              message.role === 'user'
                ? 'bg-gradient-to-br from-red-600 to-red-700 text-white'
                : 'bg-white text-slate-800 border border-slate-200'
            }`}
          >
            <p className="text-sm leading-relaxed">{message.content}</p>
            <p className={`text-xs mt-2 ${
              message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
            }`}>
              {message.timestamp.toLocaleTimeString()}
            </p>
          </div>

          {message.role === 'user' && (
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-full flex items-center justify-center shadow-md border-2 border-white">
              <User className="w-5 h-5 text-white" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}