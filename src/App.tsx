import React, { useEffect, useState } from 'react';
import { ConversationProvider, useConversation } from './context/ConversationContext';
import { useAuth } from './hooks/useAuth';
import { useConversationManager } from './hooks/useConversationManager';
import { ConversationHistory } from './components/ConversationHistory';
import { ChatInput } from './components/ChatInput';
import { UserProfile } from './components/UserProfile';
import { AuthPage } from './components/AuthPage';
import { WelcomeModal } from './components/WelcomeModal';
import { ConversationHub } from './components/ConversationHub';
import { ApiClient } from './services/apiClient';
import ImmigoLogo from './assets/immigo_logo.png';

const pollyVoices = [
    { id: 'Joanna', name: 'Joanna (US Female)' },
    { id: 'Matthew', name: 'Matthew (US Male)' },
    { id: 'Amy', name: 'Amy (British Female)' },
    { id: 'Geraint', name: 'Geraint (Welsh Male)' },
    { id: 'Kajal', name: 'Kajal (Indian Female)' },
];

function ConversationUI() {
  const { state, dispatch } = useConversation();
  const { user, session, logout } = useAuth();
  const { startSession, endSession, sendTextMessage } = useConversationManager();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const hasSeenWelcome = sessionStorage.getItem('hasSeenWelcome');
    if (!hasSeenWelcome) {
      setShowWelcome(true);
      sessionStorage.setItem('hasSeenWelcome', 'true');
    }
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      if (session) {
        const apiClient = new ApiClient(session.access_token);
        try {
            const history = await apiClient.getHistory();
            dispatch({ type: 'SET_HISTORY', payload: history });
        } catch (error) {
            console.error("Failed to fetch history:", error);
            if (error instanceof Error && error.message.includes("401")) {
                logout();
            }
        }
      }
    };
    fetchHistory();
  }, [session, dispatch, logout]);

  const handleClearError = () => dispatch({ type: 'CLEAR_ERROR' });
  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => dispatch({ type: 'SET_VOICE', payload: e.target.value });
  const isInputDisabled = !state.isSessionActive;
  const userName = user?.user_metadata?.full_name || user?.email || 'User';
  const userInitials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

  return (
    <>
      {showWelcome && <WelcomeModal userName={userName} onClose={() => setShowWelcome(false)} />}
      <div className="h-screen bg-immigo-gray-100 flex flex-col font-sans">
        <header className="bg-star-white shadow-md border-b border-immigo-gray-200 px-4 sm:px-8 py-4 flex-shrink-0">
          {/* Header content remains the same */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img src={ImmigoLogo} alt="ImmiGo Logo" className="w-12 h-12 object-contain" />
              <div>
                <h1 className="text-2xl font-bold font-display text-deep-navy">ImmiGo</h1>
                <p className="text-immigo-gray-600 text-sm">Your AI Conversation Partner</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <select value={state.voiceId} onChange={handleVoiceChange} className="bg-immigo-gray-100 border-2 p-2 rounded-lg text-sm">
                {pollyVoices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
              </select>
              {user && <UserProfile user={{ name: userName, initials: userInitials }} onLogout={logout} />}
            </div>
          </div>
        </header>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden gap-6 p-6">
          {/* Main Content Area (Left) */}
          <main className="lg:col-span-8 xl:col-span-9 flex flex-col bg-star-white shadow-xl border rounded-2xl overflow-hidden h-full">
            <ConversationHistory messages={state.conversationHistory} />
            <ChatInput onSendMessage={sendTextMessage} disabled={isInputDisabled} />
          </main>

          {/* Right Sidebar */}
          <aside className="lg:col-span-4 xl:col-span-3 flex flex-col h-full">
            <ConversationHub
              status={state.appStatus}
              isSessionActive={state.isSessionActive}
              sessionTime={state.sessionTime}
              errorMessage={state.errorMessage}
              onStartSession={startSession}
              onEndSession={endSession}
              onClearError={handleClearError}
            />
          </aside>
        </div>

        <footer className="w-full text-center py-2 px-6 bg-immigo-gray-200 flex-shrink-0">
            <p className="text-xs text-immigo-gray-600">&copy; 2025 ImmiGo. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="h-screen bg-immigo-gray-50" />;
  }

  return (
    <>
      {user ? (
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