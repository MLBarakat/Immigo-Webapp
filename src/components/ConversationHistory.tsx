import { useEffect, useRef } from 'react';
import { Message } from '../types/conversation';
import { DisplayUser } from '../types/user';
import ImmigoLogo from '../assets/immigo_logo.png';
import { AlertTriangle } from 'lucide-react';

interface ConversationHistoryProps {
  messages: readonly Message[];
  displayUser: DisplayUser;
  isTranscribing: boolean;
  transcript: string;
  currentBotMessage: string | null;
  recognitionError: string | null;
  onClearRecognitionError: () => void;
}

export function ConversationHistory({
  messages,
  displayUser,
  isTranscribing,
  transcript,
  currentBotMessage,
  recognitionError,
  onClearRecognitionError,
}: ConversationHistoryProps): JSX.Element {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, transcript, currentBotMessage]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {messages.map((msg) => (
        <div key={msg.id} className={`flex items-start gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          {msg.role === 'assistant' && (
            <img src={ImmigoLogo} alt="AI Avatar" className="w-10 h-10 rounded-full border border-immigo-gray-200" />
          )}
          <div
            className={`max-w-[70%] p-3 rounded-xl shadow-sm ${
              msg.role === 'user'
                ? 'bg-art-blue-600 text-star-white rounded-br-none'
                : 'bg-immigo-gray-200 text-deep-navy rounded-bl-none'
            }`}
          >
            <p className="text-sm">{msg.content}</p>
          </div>
          {msg.role === 'user' && (
            <div className="w-10 h-10 rounded-full bg-deep-navy text-star-white flex items-center justify-center font-bold flex-shrink-0">
              {displayUser.initials}
            </div>
          )}
        </div>
      ))}

      {/* Live Transcription & AI Response Placeholders */}
      {isTranscribing && transcript && (
        <div className="flex items-start gap-4 justify-end">
          <div className="max-w-[70%] p-3 rounded-xl shadow-sm bg-immigo-gray-100 text-immigo-gray-500 rounded-br-none italic">
            <p className="text-sm">{transcript}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-deep-navy text-star-white flex items-center justify-center font-bold flex-shrink-0">
            {displayUser.initials}
          </div>
        </div>
      )}
      {currentBotMessage && (
        <div className="flex items-start gap-4 justify-start">
          <img src={ImmigoLogo} alt="AI Avatar" className="w-10 h-10 rounded-full border border-immigo-gray-200" />
          <div className="max-w-[70%] p-3 rounded-xl shadow-sm bg-immigo-gray-100 text-immigo-gray-500 rounded-bl-none italic">
            <p className="text-sm">{currentBotMessage}</p>
          </div>
        </div>
      )}

      {/* Recognition Error */}
      {recognitionError && (
          <div className="flex justify-center">
              <div className="p-3 rounded-lg bg-art-red-50 text-art-red-700 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5"/>
                  <span className="text-sm font-medium">{recognitionError}</span>
                  <button onClick={onClearRecognitionError} className="font-bold">OK</button>
              </div>
          </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}