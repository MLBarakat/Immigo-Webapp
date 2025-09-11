import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { ConversationProvider, useConversation } from './context/ConversationContext';
import { useConversationManager } from './hooks/useConversationManager';
import { StatusIndicator } from './components/StatusIndicator';
import { ConversationHistory } from './components/ConversationHistory';
import { ControlPanel } from './components/ControlPanel';
import { ChatInput } from './components/ChatInput';
import { LoginButton } from './components/LoginButton';
import { UserProfile } from './components/UserProfile';
import ImmigoLogo from './assets/immigo-logo.png';

const pollyVoices = [
  { id: 'Joanna', name: 'Joanna (US English, Female)' },
  { id: 'Matthew', name: 'Matthew (US English, Male)' },
  { id: 'Salli', name: 'Salli (US English, Female)' },
  { id: 'Ruth', name: 'Ruth (US English, Female)' },
  { id: 'Stephen', name: 'Stephen (US English, Male)' },
  { id: 'Kajal', name: 'Kajal (Indian English, Female)' },
  { id: 'Arthur', name: 'Arthur (British English, Male)' },
];

function ConversationApp() {
  const { state, dispatch } = useConversation();
  const { startSession, endSession, sendTextMessage } = useConversationManager();

  const [user, setUser] = useState<{ name: string; initials: string } | null>(null);

  const handleLogin = () => {
    setUser({ name: 'John Doe', initials: 'JD' });
  };

  const handleLogout = () => {
    setUser(null);
  };

  const handleClearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const handleVoiceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch({ type: 'SET_VOICE', payload: event.target.value });
  };

  const isInputDisabled = state.appStatus !== 'idle' && state.appStatus !== 'error';

  return (
    <div className="h-screen bg-gradient-to-br from-immigo-gray-50 via-star-white to-immigo-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-star-white shadow-xl border-b-4 border-art-blue-600 px-4 sm:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="relative w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center">
              <img src={ImmigoLogo} alt="Immigo Logo" className="w-full h-full object-contain drop-shadow-md" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-display bg-gradient-to-r from-art-red-700 via-art-blue-700 to-deep-navy bg-clip-text text-transparent drop-shadow-lg">
                ImmiGo
              </h1>
              <p className="text-deep-navy font-semibold text-sm sm:text-lg mt-1 tracking-wide">
                Your Real-Time AI Conversation Partner
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            <select
              value={state.voiceId}
              onChange={handleVoiceChange}
              className="bg-immigo-gray-100 border-2 border-immigo-gray-300 text-deep-navy text-sm rounded-lg focus:ring-art-blue-500 focus:border-art-blue-500 p-2 shadow-sm w-32 sm:w-auto"
            >
              {pollyVoices.map(voice => (
                <option key={voice.id} value={voice.id}>{voice.name}</option>
              ))}
            </select>

            <div>
              {user ? (
                <UserProfile user={user} onLogout={handleLogout} />
              ) : (
                <LoginButton onLogin={handleLogin} />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-2 sm:p-4 lg:p-6 gap-4 lg:gap-6 bg-immigo-gray-100">
        {/* Conversation History & Input */}
        <div className="flex-1 flex flex-col bg-star-white shadow-xl border border-immigo-gray-200 rounded-2xl overflow-hidden h-full">
          <div className="bg-gradient-to-r from-immigo-gray-50 via-star-white to-immigo-gray-100 border-b-2 border-immigo-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7 text-art-blue-600" />
              <h2 className="text-xl sm:text-2xl font-bold text-deep-navy font-display">Conversation</h2>
            </div>
          </div>
          <ConversationHistory messages={state.conversationHistory} />
          <ChatInput onSendMessage={sendTextMessage} disabled={isInputDisabled} />
        </div>

        {/* Status Panel & Controls */}
        <div className="flex flex-col bg-star-white shadow-xl border border-immigo-gray-200 rounded-2xl lg:w-96 lg:h-full">
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <StatusIndicator
              status={state.appStatus}
              errorMessage={state.errorMessage}
            />
          </div>
          <ControlPanel
            status={state.appStatus}
            isSessionActive={state.isSessionActive}
            onStartSession={startSession}
            onEndSession={endSession}
            onClearError={handleClearError}
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-deep-navy border-t-4 border-art-red-600 px-4 sm:px-8 py-3 text-center sm:text-left">
        <div className="flex items-center justify-center">
          <div className="text-immigo-gray-300 text-sm font-medium">
            <p>&copy; 2024 Immigo. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <ConversationProvider>
      <ConversationApp />
    </ConversationProvider>
  );
}

export default App;