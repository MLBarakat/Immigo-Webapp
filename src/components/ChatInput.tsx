import React, { useState, useRef } from 'react'; // REMOVED useEffect
import { Send, Mic, StopCircle } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled: boolean; // ADDED this line
  // The following props can be added back if speech recognition is re-integrated
  // startAudioInput: () => void;
  // stopAudioInput: () => void;
  // isTranscribing: boolean;
  // micMode: 'voice_activity' | 'push_to_talk';
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled,
}) => {
  const [message, setMessage] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isTranscribing = false; // Hardcoded for now

  const handleSendMessage = () => {
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <div className="flex items-center p-4 bg-star-white dark:bg-gray-800 border-t border-immigo-gray-200 dark:border-gray-700 md:rounded-b-lg">
      <button
        disabled={disabled}
        className={`p-3 rounded-full mr-3 transition-colors duration-200 ease-in-out ${
          isTranscribing
            ? 'bg-art-red-600 hover:bg-art-red-700 text-star-white'
            : 'bg-immigo-gray-100 hover:bg-immigo-gray-200 text-immigo-gray-600'
        }`}
        aria-label={isTranscribing ? 'Stop audio input' : 'Start audio input'}
      >
        {isTranscribing ? <StopCircle className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
      </button>

      <input
        type="text"
        className="flex-grow p-3 border-2 border-immigo-gray-300 rounded-lg focus:outline-none focus:border-art-blue-600 text-deep-navy placeholder-immigo-gray-400 disabled:bg-immigo-gray-100"
        placeholder="Type a message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        ref={inputRef}
        disabled={disabled}
      />

      <button
        onClick={handleSendMessage}
        className="ml-3 p-3 rounded-full bg-art-blue-600 hover:bg-art-blue-700 text-star-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Send message"
        disabled={!message.trim() || disabled}
      >
        <Send className="w-6 h-6" />
      </button>
    </div>
  );
};