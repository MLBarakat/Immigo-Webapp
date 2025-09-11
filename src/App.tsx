import React, { useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { ConversationProvider, useConversation } from './context/ConversationContext';
import { useAuth } from './context/AuthContext';
import { useConversationManager } from './hooks/useConversationManager';
import { StatusIndicator } from './components/StatusIndicator';
import { ConversationHistory } from './components/ConversationHistory';
import { ControlPanel } from './components/ControlPanel';
import { ChatInput } from './components/ChatInput';
import { UserProfile } from './components/UserProfile';
import { AuthPage } from './components/AuthPage';
import { ApiClient } from './services/apiClient';
import ImmigoLogo from './assets/immigo_logo.png';

const pollyVoices =;

function ConversationUI() {
  const { state, dispatch } = useConversation();
  const { user, session, logout } = useAuth();
  const { startSession, endSession, sendTextMessage } = useConversationManager();

  useEffect(() => {
    const fetchHistory = async () => {
      if (session) {
        const apiClient = new ApiClient(session.access_token);
        const history = await apiClient.getHistory();
        dispatch({ type: 'SET_HISTORY', payload: history });
      }
    };
    fetchHistory();
  }, [session, dispatch]);

  const handleClearError = () => dispatch({ type: 'CLEAR_ERROR' });
  const handleVoiceChange = (e) => dispatch({ type: 'SET_VOICE', payload: e.target.value });
  const isInputDisabled = state.appStatus!== 'idle' && state.appStatus!== 'error';

  return (
    <div className="h-screen bg-gradient-to-br from-immigo-gray-50 via-star-white to-immigo-gray-50 flex flex-col font-sans">
      <header className="bg-star-white shadow-xl border-b-4 border-art-blue-600 px-4 sm:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="relative w-12 h-12 sm:w-16 sm:h-16">
              <img src={ImmigoLogo} alt="Immigo Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold">Immigo</h1>
              <p className="text-deep-navy font-semibold text-sm sm:text-lg">Your AI Conversation Partner</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <select value={state.voiceId} onChange={handleVoiceChange} className="bg-immigo-gray-100 border-2 p-2 rounded-lg">
              {pollyVoices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
            </select>
            {user && <UserProfile user={{ name: user.email, initials: user.email?.substring(0, 2).toUpperCase() }} onLogout={logout} />}
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden p-2 sm:p-4 lg:p-6 gap-4 lg:gap-6 bg-immigo-gray-100">
        <div className="flex-1 flex flex-col bg-star-white shadow-xl border rounded-2xl overflow-hidden h-full">
          <ConversationHistory messages={state.conversationHistory} />
          <ChatInput onSendMessage={sendTextMessage} disabled={isInputDisabled} />
        </div>
        <div className="flex flex-col bg-star-white shadow-xl border rounded-2xl lg:w-96">
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <StatusIndicator status={state.appStatus} errorMessage={state.errorMessage} />
          </div>
          <ControlPanel status={state.appStatus} isSessionActive={state.isSessionActive} onStartSession={startSession} onEndSession={endSession} onClearError={handleClearError} />
        </div>
      </main>
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="h-screen bg-immigo-gray-50" />;
  }

  return (
    <>
      {user? (
        <ConversationProvider>
          <ConversationUI />
        </ConversationProvider>
      ) : (
        <AuthPage />
      )}
    </>
  );
}

export default App;