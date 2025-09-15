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
import { LanguageSelector } from './components/LanguageSelector';
import { FontSizeSelector } from './components/FontSizeSelector';
import { ApplicationSettingsModal } from './components/ApplicationSettingsModal';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { ApiClient } from './services/apiClient';
import ImmigoLogo from './assets/immigo_logo.png';
import { Menu, LogOut, Settings } from 'lucide-react';

const pollyVoices = [
    { id: 'Joanna', name: 'Joanna (US Female)' },
    { id: 'Matthew', name: 'Matthew (US Male)' },
    { id: 'Amy', name: 'Amy (British Female)' },
    { id: 'Geraint', name: 'Geraint (Welsh Male)' },
    { id: 'Kajal', name: 'Kajal (Indian Female)' },
];

function countryCodeToFlagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .split('')
    .map(char => String.fromCodePoint(char.charCodeAt(0) + 0x1F1E6 - 65))
    .join('');
}

const availableLanguages = [
  { code: 'en', name: 'English', flag: countryCodeToFlagEmoji('US') },
  { code: 'es', name: 'Español', flag: countryCodeToFlagEmoji('ES') },
  { code: 'fr', name: 'Français', flag: countryCodeToFlagEmoji('FR') },
  { code: 'ar', name: 'العربية', flag: countryCodeToFlagEmoji('AR') }
];

function ConversationUI() {
  const { state, dispatch } = useConversation();
  const { user, session, logout } = useAuth();
  const { startSession, endSession, sendTextMessage, clearConversation, downloadTranscript } = useConversationManager();

  const [showWelcome, setShowWelcome] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAppSettingsOpen, setIsAppSettingsOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);

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

  const handleLanguageChange = (newCode: string) => dispatch({ type: 'SET_LANGUAGE', payload: newCode });
  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => dispatch({ type: 'SET_VOICE', payload: e.target.value });
  const isInputDisabled = ['listening', 'processing', 'speaking'].includes(state.appStatus);
  const userName = user?.user_metadata?.full_name || user?.email || 'User';
  const userInitials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

  if (isAccountSettingsOpen) {
      return <AccountSettingsPage />;
  }

  return (
    <>
      <WelcomeModal userName={userName} onClose={() => setShowWelcome(false)} />
      <ApplicationSettingsModal isOpen={isAppSettingsOpen} onClose={() => setIsAppSettingsOpen(false)} />
      <MobileMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onClearConversation={clearConversation}
        onDownloadTranscript={downloadTranscript}
        onLogout={logout}
        onOpenAppSettings={() => { setIsMenuOpen(false); setIsAppSettingsOpen(true); }}
        onOpenAccountSettings={() => { setIsMenuOpen(false); setIsAccountSettingsOpen(true); }}
        userName={userName}
      />
      <div className="h-screen w-screen overflow-hidden bg-immigo-gray-100 flex flex-col font-sans">
        <header className="bg-star-white shadow-md border-b border-immigo-gray-200 px-4 sm:px-8 py-3 flex-shrink-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img src={ImmigoLogo} alt="ImmiGo Logo" className="w-10 h-10 object-contain" />
              <h1 className="text-xl lg:text-2xl font-bold font-display text-deep-navy">ImmiGo</h1>
            </div>
            <div className="flex items-center space-x-2">
              <div className="hidden lg:flex items-center space-x-2">
                <LanguageSelector currentLanguageCode={state.currentLanguageCode} onLanguageChange={handleLanguageChange} availableLanguages={availableLanguages} />
                <FontSizeSelector />
                <button onClick={() => setIsAppSettingsOpen(true)} className="p-2 rounded-full hover:bg-immigo-gray-100" title="Application Settings">
                  <Settings className="w-6 h-6 text-deep-navy" />
                </button>
                <button onClick={() => setIsAccountSettingsOpen(true)} className="p-2 rounded-full hover:bg-immigo-gray-100" title="Account Settings">
                    <UserProfile user={{ name: userName, initials: userInitials }} />
                </button>
                <button onClick={logout} className="p-2 rounded-full hover:bg-immigo-gray-100" title="Logout">
                    <LogOut className="w-6 h-6 text-deep-navy" />
                </button>
              </div>
              <button onClick={() => setIsMenuOpen(true)} className="lg:hidden p-2 rounded-full hover:bg-immigo-gray-100">
                <Menu className="w-6 h-6 text-deep-navy" />
              </button>
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
              onClearError={() => dispatch({ type: 'CLEAR_ERROR' })}
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
                onClearError={() => dispatch({ type: 'CLEAR_ERROR' })}
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