import React, { useState, useRef } from 'react';
import { Send, Mic, StopCircle } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  startAudioInput: () => void;
  stopAudioInput: () => void;
  isTranscribing: boolean;
  isSpeaking: boolean;
  setIsSpeaking: (speaking: boolean) => void; // Added for external control if needed
  micMode: 'voice_activity' | 'push_to_talk';
  audioLevel: number; // Placeholder for future visualization
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  startAudioInput,
  stopAudioInput,
  isTranscribing,
  micMode,
  isSpeaking,
  setIsSpeaking,
  audioLevel
}) => {
  const [message, setMessage] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleMicButtonClick = () => {
    if (isTranscribing) {
      stopAudioInput();
    } else {
      startAudioInput();
    }
  };

  return (
    <div className="flex items-center p-4 bg-star-white dark:bg-gray-800 border-t border-immigo-gray-200 dark:border-gray-700 md:rounded-b-lg">
      {/* Microphone/Stop Button */}
      <button
        onClick={handleMicButtonClick}
        className={`p-3 rounded-full mr-3 transition-colors duration-200 ease-in-out ${
          isTranscribing
            ? 'bg-art-red-600 hover:bg-art-red-700 text-star-white'
            : 'bg-immigo-gray-100 hover:bg-immigo-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-immigo-gray-600 dark:text-immigo-gray-300'
        }`}
        aria-label={isTranscribing ? 'Stop audio input' : 'Start audio input'}
      >
        {isTranscribing ? <StopCircle className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
      </button>

      {/* Text Input */}
      <input
        type="text"
        className="flex-grow p-3 border-2 border-immigo-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-art-blue-600 dark:bg-gray-700 dark:text-star-white text-deep-navy placeholder-immigo-gray-400 dark:placeholder-immigo-gray-500 transition-colors"
        placeholder="Type a message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        ref={inputRef}
        disabled={isTranscribing && micMode === 'voice_activity'} // Disable text input if voice activity mode is active
      />

      {/* Send Button */}
      <button
        onClick={handleSendMessage}
        className="ml-3 p-3 rounded-full bg-art-blue-600 hover:bg-art-blue-700 text-star-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Send message"
        disabled={!message.trim()}
      >
        <Send className="w-6 h-6" />
      </button>
    </div>
  );
};