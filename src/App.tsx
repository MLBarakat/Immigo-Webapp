import React from 'react';
import { MessageSquare } from 'lucide-react';
import { ConversationProvider, useConversation } from './context/ConversationContext';
import { useConversationManager } from './hooks/useConversationManager';
import { StatusIndicator } from './components/StatusIndicator';
import { ConversationHistory } from './components/ConversationHistory';
import { ControlPanel } from './components/ControlPanel';
import { ChatInput } from './components/ChatInput';
import ImmigoLogo from './assets/immigo-logo.png';

function ConversationApp() {
  const { state, dispatch } = useConversation();
  const { startSession, endSession, sendTextMessage } = useConversationManager();

  const handleClearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const isInputDisabled = state.appStatus !== 'idle' && state.appStatus !== 'error';

  return (
    <div className="h-screen bg-immigo-gray-100 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white shadow-lg border-b-4 border-crisp-blue-500 px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <img src={ImmigoLogo} alt="Immigo Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-4xl font-extrabold bg-gradient-to-r from-crisp-red-600 via-crisp-blue-600 to-crisp-blue-700 bg-clip-text text-transparent drop-shadow-sm">
                Immigo
              </h1>
              <p className="text-crisp-blue-700 font-semibold text-lg mt-1 tracking-wide">
                Your Real-time AI Conversation Partner
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className={`flex items-center space-x-2 px-5 py-2 rounded-full text-sm font-bold shadow-md ${
              state.isSessionActive
                ? 'bg-immigo-green-100 text-immigo-green-800 border-2 border-immigo-green-300'
                : 'bg-immigo-gray-100 text-immigo-gray-700 border-2 border-immigo-gray-300'
            }`}>
              <div className={`w-3 h-3 rounded-full ${
                state.isSessionActive ? 'bg-immigo-green-500 animate-pulse' : 'bg-immigo-gray-500'
              }`} />
              <span>{state.isSessionActive ? 'Active Session' : 'Session Inactive'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-4 gap-4">
        {/* Conversation History & Input */}
        <div className="flex-1 flex flex-col bg-white shadow-md border border-immigo-gray-200 rounded-xl overflow-hidden">
          <div className="bg-white border-b-2 border-immigo-gray-200 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <MessageSquare className="w-7 h-7 text-crisp-blue-600" />
              <h2 className="text-2xl font-bold text-crisp-blue-700">Conversation History</h2>
            </div>
          </div>
          <ConversationHistory messages={state.conversationHistory} />
          <ChatInput onSendMessage={sendTextMessage} disabled={isInputDisabled} />
        </div>

        {/* Status Panel & Controls */}
        <div className="lg:w-96 bg-white flex flex-col shadow-md border border-immigo-gray-200 rounded-xl">
          <div className="flex-1 flex items-center justify-center p-8">
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
      <footer className="bg-crisp-blue-800 border-t-4 border-crisp-red-500 px-8 py-3">
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