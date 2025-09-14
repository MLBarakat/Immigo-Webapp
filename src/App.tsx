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
import { MobileMenu } from './components/MobileMenu';
import { LanguageSelector } from './components/LanguageSelector'; // Import new component
import { ApiClient } from './services/apiClient';
import ImmigoLogo from './assets/immigo_logo.png';
import { Menu, LogOut } from 'lucide-react'; // Import LogOut icon for desktop

// Define available languages with flags
const availableLanguages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
];

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
  const { startSession, endSession, sendTextMessage, clearConversation, downloadTranscript } = useConversationManager();
  const [showWelcome, setShowWelcome] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentLanguageCode, setCurrentLanguageCode] = useState('en'); // New state for language

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

  // Effect to update context when currentLanguageCode changes
  useEffect(() => {
      dispatch({ type: 'SET_LANGUAGE', payload: currentLanguageCode });
  }, [currentLanguageCode, dispatch]);

  const handleClearError = () => dispatch({ type: 'CLEAR_ERROR' });
  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => dispatch({ type: 'SET_VOICE', payload: e.target.value });
  const handleLanguageChange = (newCode: string) => setCurrentLanguageCode(newCode); // Handler for language change
  const isInputDisabled = ['listening', 'processing', 'speaking'].includes(state.appStatus);
  const userName = user?.user_metadata?.full_name || user?.email || 'User';
  const userInitials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

  return (
    <>
      {showWelcome && <WelcomeModal userName={userName} onClose={() => setShowWelcome(false)} />}
      <MobileMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        voiceId={state.voiceId}
        onVoiceChange={handleVoiceChange}
        pollyVoices={pollyVoices}
        onClearConversation={clearConversation}
        onDownloadTranscript={downloadTranscript}
        onLogout={logout}
      />
      <div className="h-screen w-screen overflow-hidden bg-immigo-gray-100 flex flex-col font-sans">
        <header className="bg-star-white shadow-md border-b border-immigo-gray-200 px-4 sm:px-8 py-3 flex-shrink-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img src={ImmigoLogo} alt="ImmiGo Logo" className="w-10 h-10 object-contain" />
              <div>
                <h1 className="text-xl lg:text-2xl font-bold font-display text-deep-navy">ImmiGo</h1>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {user && (
                <>
                  {/* Desktop Header Elements */}
                  <div className="hidden lg:flex items-center space-x-4">
                    <LanguageSelector
                        currentLanguageCode={currentLanguageCode}
                        onLanguageChange={handleLanguageChange}
                        availableLanguages={availableLanguages}
                    />
                    <UserProfile user={{ name: userName, initials: userInitials }} /> {/* Name removed */}
                    <button onClick={logout} className="p-2 rounded-full hover:bg-immigo-gray-100" title="Logout">
                        <LogOut className="w-6 h-6 text-deep-navy" />
                    </button>
                  </div>
                  {/* Mobile Menu Toggle */}
                  <button onClick={() => setIsMenuOpen(true)} className="lg:hidden p-2 rounded-full hover:bg-immigo-gray-100">
                    <Menu className="w-6 h-6 text-deep-navy" />
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden lg:gap-6 lg:p-6">
          <main className="lg:col-span-8 xl:col-span-9 flex flex-col bg-star-white lg:shadow-xl lg:border lg:rounded-2xl overflow-hidden h-full">
            <ConversationHistory messages={state.conversationHistory} />
            <div className="hidden lg:block">
              <ChatInput onSendMessage={sendTextMessage} disabled={isInputDisabled} />
            </div>
          </main>

          <aside className="hidden lg:flex lg:col-span-4 xl:col-span-3 h-full">
            <ConversationHub
              status={state.appStatus}
              isSessionActive={state.isSessionActive}
              sessionTime={state.sessionTime}
              errorMessage={state.errorMessage}
              onStartSession={startSession}
              onEndSession={endSession}
              onClearError={handleClearError}
              onVoiceChange={handleVoiceChange}
              voiceId={state.voiceId}
              pollyVoices={pollyVoices}
              onClearConversation={clearConversation}
              onDownloadTranscript={downloadTranscript}
            />
          </aside>
        </div>

        <div className="lg:hidden flex items-start p-2 bg-gradient-to-t from-immigo-gray-100 to-star-white border-t-2 border-immigo-gray-200 flex-shrink-0">
            <ChatInput onSendMessage={sendTextMessage} disabled={isInputDisabled} />
            <ConversationHub
                status={state.appStatus}
                isSessionActive={state.isSessionActive}
                sessionTime={state.sessionTime}
                errorMessage={state.errorMessage}
                onStartSession={startSession}
                onEndSession={endSession}
                onClearError={handleClearError}
                onVoiceChange={handleVoiceChange}
                voiceId={state.voiceId}
                pollyVoices={pollyVoices}
                onClearConversation={clearConversation}
                onDownloadTranscript={downloadTranscript}
            />
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

  // The redundant <AuthProvider> wrapper is removed here.
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