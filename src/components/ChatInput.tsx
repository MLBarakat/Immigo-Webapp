import React, { useState } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSendMessage, disabled }: ChatInputProps): JSX.Element {
  const [message, setMessage] = useState('');

  const handleSendMessage = () => {
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="p-2 md:p-4 bg-star-white border-t border-immigo-gray-200">
      <div className="relative">
        <textarea
          rows={2}
          className="w-full p-3 pr-14 border-2 border-immigo-gray-300 rounded-lg resize-none focus:outline-none focus:border-art-blue-600 disabled:bg-immigo-gray-100 disabled:cursor-not-allowed"
          placeholder={disabled ? "Voice conversation is active..." : "Type a message..."}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={disabled}
        />
        <button
          onClick={handleSendMessage}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-art-blue-600 text-star-white hover:bg-art-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Send message"
          disabled={!message.trim() || disabled}
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}