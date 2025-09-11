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
    <div className="p-4 bg-gradient-to-t from-immigo-gray-50 to-star-white border-t-2 border-immigo-gray-200">
      <form onSubmit={handleSubmit} className="flex items-center space-x-3">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          disabled={disabled}
          className="flex-1 p-3 border-2 border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500 disabled:bg-immigo-gray-100 disabled:opacity-70 text-deep-navy placeholder-immigo-gray-500"
        />
        <button
          type="submit"
          disabled={disabled || !message.trim()}
          className="p-3 bg-art-blue-600 text-star-white rounded-lg shadow-md hover:bg-art-blue-700 focus:outline-none focus:ring-2 focus:ring-art-blue-500 disabled:bg-immigo-gray-400 disabled:cursor-not-allowed transform hover:scale-105 transition-transform"
        >
          <Send className="w-6 h-6" />
        </button>
      </form>
    </div>
  );
};