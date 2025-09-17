import React, { useState } from 'react';
import { Send, Mic, StopCircle } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled: boolean;
  startAudioInput: () => void;
  stopAudioInput: () => void;
  isTranscribing: boolean;
}

export function ChatInput({ onSendMessage, disabled, startAudioInput, stopAudioInput, isTranscribing }: ChatInputProps): JSX.Element {
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

  const handleMicClick = () => {
    if (isTranscribing) {
      stopAudioInput();
    } else {
      startAudioInput();
    }
  };

  return (
    <div className="p-2 md:p-4 bg-star-white border-t border-immigo-gray-200 flex items-center gap-2">
       <button
        onClick={handleMicClick}
        disabled={disabled}
        className={`p-3 rounded-full transition-colors flex-shrink-0 ${
          isTranscribing ? 'bg-art-red-100 text-art-red-600' : 'hover:bg-immigo-gray-100'
        }`}
      >
        {isTranscribing ? <StopCircle className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
      </button>
      <div className="relative flex-grow">
        <textarea
          rows={2}
          className="w-full p-3 pr-14 border-2 border-immigo-gray-300 rounded-lg resize-none focus:outline-none focus:border-art-blue-600"
          placeholder="Type a message..."
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