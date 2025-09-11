import React from 'react';
import { MessageSquare, Flag, Sparkles } from 'lucide-react';
import { ConversationProvider, useConversation } from './context/ConversationContext';
import { useConversationManager } from './hooks/useConversationManager';
import { StatusIndicator } from './components/StatusIndicator';
import { ConversationHistory } from './components/ConversationHistory';
import { ControlPanel } from './components/ControlPanel';

function ConversationApp() {
  const { state, dispatch } = useConversation();
  const { startSession, endSession } = useConversationManager();

  const handleClearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  return (
    <div className="h-screen bg-gradient-to-br from-red-50 via-white to-blue-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-lg border-b-2 border-blue-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="relative w-12 h-12 bg-gradient-to-br from-red-600 via-white to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <Flag className="w-7 h-7 text-slate-700" />
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                <Sparkles className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-red-600 via-blue-700 to-blue-800 bg-clip-text text-transparent">
                Voice AI Assistant
              </h1>
              <p className="text-slate-600 font-medium">
                Real-time voice conversation with AI
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-semibold ${
              state.isSessionActive 
                ? 'bg-green-100 text-green-700 border border-green-200' 
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                state.isSessionActive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
              }`} />
              <span>{state.isSessionActive ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Conversation History */}
        <div className="flex-1 flex flex-col bg-white shadow-inner border-r border-slate-200">
          <div className="bg-gradient-to-r from-slate-50 to-white border-b-2 border-slate-200 px-6 py-4">
            <div className="flex items-center space-x-3">
              <MessageSquare className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-slate-800">Conversation</h2>
            </div>
          </div>
          <ConversationHistory messages={state.conversationHistory} />
        </div>

        {/* Status Panel */}
        <div className="lg:w-96 bg-gradient-to-b from-white to-slate-50 flex flex-col">
          <div className="bg-gradient-to-r from-slate-50 to-white border-b-2 border-slate-200 px-6 py-4">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Status</h2>
            </div>
          </div>
          
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
      <footer className="bg-gradient-to-r from-slate-800 to-slate-900 border-t-2 border-slate-700 px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-red-500 via-white to-blue-500 rounded-lg flex items-center justify-center">
              <Flag className="w-4 h-4 text-slate-700" />
            </div>
            <p className="text-slate-300 font-medium">Powered by AWS Bedrock & Polly</p>
          </div>
          <div className="text-slate-400 text-sm">
            <p>© 2024 Voice AI Assistant</p>
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