import { useState, KeyboardEvent, ChangeEvent } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  readonly onSendMessage: (message: string) => void;
  readonly disabled: boolean;
}

export function ChatInput({ onSendMessage, disabled }: ChatInputProps): JSX.Element {
  const [message, setMessage] = useState<string>('');

  const handleSendMessage = (): void => {
    const validatedText = message.trim();
    if (validatedText) {
      onSendMessage(validatedText);
      setMessage('');
    }
  };

  // FIXED: Replaced deprecated onKeyPress with modern, type-safe onKeyDown handling
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setMessage(e.target.value);
  };

  const isInputEmpty = !message.trim();

  return (
    <div className="p-2 md:p-4 bg-star-white" role="form" aria-label="Manual Chat Message Area">
      <div className="relative">
        <textarea
          rows={2}
          className="w-full p-3 pr-14 border-2 border-immigo-gray-300 rounded-lg resize-none focus:outline-none focus:border-art-blue-600 disabled:bg-immigo-gray-100 disabled:cursor-not-allowed text-sm text-deep-navy placeholder-immigo-gray-400"
          placeholder={disabled ? "Voice conversation is active..." : "Type a message..."}
          value={message}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-label={disabled ? "Keyboard input disabled while voice session is active" : "Message text input field"}
          aria-disabled={disabled}
        />
        <button
          onClick={handleSendMessage}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-art-blue-600 text-star-white hover:bg-art-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          aria-label="Send manual text message"
          disabled={isInputEmpty || disabled}
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}