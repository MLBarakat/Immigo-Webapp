import React, { useEffect, useRef } from 'react';
import { Message } from '../types/conversation';

interface ConversationHistoryProps {
  messages: Message[];
  isTranscribing: boolean;
  transcript: string;
  currentBotMessage: string | null;
  recognitionError: string | null;
  onClearRecognitionError: () => void;
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  messages,
  isTranscribing,
  transcript,
  currentBotMessage,
  recognitionError,
  onClearRecognitionError,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, transcript, currentBotMessage]); // Scroll when new messages or transcript updates

  return (
    <div className="flex-grow overflow-y-auto p-4 space-y-4 rounded-lg bg-immigo-gray-50 dark:bg-gray-900">
      {messages.map((msg, index) => (
        <div key={msg.id || index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[70%] p-3 rounded-xl shadow-sm ${
              msg.role === 'user'
                ? 'bg-art-blue-600 text-star-white rounded-br-none'
                : 'bg-immigo-gray-200 dark:bg-gray-700 text-deep-navy dark:text-star-white rounded-bl-none'
            }`}
          >
            <p className="text-sm">{msg.content}</p>
            <span className="block text-right text-xs mt-1 opacity-75">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      ))}

      {isTranscribing && transcript && (
        <div className="flex justify-end">
          <div className="max-w-[70%] p-3 rounded-xl shadow-sm bg-immigo-gray-100 dark:bg-gray-700 text-deep-navy dark:text-star-white opacity-80 italic">
            <p className="text-sm">{transcript}</p>
            <span className="block text-right text-xs mt-1 opacity-75">
              Transcribing...
            </span>
          </div>
        </div>
      )}

      {currentBotMessage && (
        <div className="flex justify-start">
          <div className="max-w-[70%] p-3 rounded-xl shadow-sm bg-immigo-gray-200 dark:bg-gray-700 text-deep-navy dark:text-star-white animate-pulse">
            <p className="text-sm">{currentBotMessage}</p>
            <span className="block text-right text-xs mt-1 opacity-75">
              AI Speaking...
            </span>
          </div>
        </div>
      )}

      {recognitionError && (
        <div className="flex justify-center">
          <div className="max-w-[70%] p-3 rounded-xl shadow-sm bg-art-red-100 text-art-red-600 border border-art-red-300 flex items-center gap-2">
            <p className="text-sm font-medium">{recognitionError}</p>
            <button onClick={onClearRecognitionError} className="text-art-red-800 hover:text-art-red-900 font-bold text-lg">
              &times;
            </button>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};