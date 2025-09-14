import React, { useState } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, disabled }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  return (
    <div className="flex-1 lg:p-4 p-2">
      <form onSubmit={handleSubmit} className="relative w-full">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          disabled={disabled}
          className="w-full p-3 pr-12 border-2 border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500 disabled:bg-immigo-gray-100 text-deep-navy"
        />
        <button
          type="submit"
          disabled={disabled || !message.trim()}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-immigo-gray-500 hover:text-art-blue-600 disabled:text-immigo-gray-300"
          aria-label="Send message"
        >
          <Send className="w-6 h-6" />
        </button>
      </form>
    </div>
  );
};