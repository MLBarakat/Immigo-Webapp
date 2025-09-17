import React, { useEffect, useState, useMemo } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { ApplicationSettingsModal } from './components/ApplicationSettingsModal';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { ConversationHub } from './components/ConversationHub';
import { MobileMenuOverlay } from './components/MobileMenuOverlay';
import { ApiClient } from './services/apiClient';
import { UserSettings } from './types/settings';
import { ConversationProvider, useConversation } from './context/ConversationContext';
import { useConversationManager } from './hooks/useConversationManager';
import useMediaQuery from './hooks/useMediaQuery';
import { AuthPage } from './components/AuthPage';
import { Header } from './components/Header';
import { ConversationHistory } from './components/ConversationHistory';
import { ChatInput } from './components/ChatInput';
import { VoiceHub } from './components/VoiceHub';
import { useAuth } from './hooks/useAuth';
import { AuthProvider } from './context/AuthContext';
import { DisplayUser } from './types/user';

const PollyVoices = [
  { id: 'Joanna', name: 'Joanna (US English)' },
  { id: 'Matthew', name: 'Matthew (US English)' },
  { id: 'Amy', name: 'Amy (British English)' },
  { id: 'Brian', name: 'Brian (British English)' },
];

const AppContent: React.FC = () => {
  const { session, user: authUser, logout } = useAuth();
  const [isAppSettingsModalOpen, setIsAppSettingsModalOpen] = useState(false);
  const [isAccountSettingsModalOpen, setIsAccountSettingsModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userSettings, setUserSettings] = useState<Partial<UserSettings>>({});
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // State for props required by child components
  const [isTranscribing] = useState(false);
  const [transcript] = useState('');
  const [currentBotMessage] = useState<string | null>(null);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);

  const apiClient = useMemo(() => {
    if (session?.access_token) { return new ApiClient(session.access_token); }
    return null;
  }, [session]);

  const conversationManager = useConversationManager({ apiClient });
  const { state, dispatch } = useConversation();

  useEffect(() => {
    const fetchSettings = async () => {
      if (apiClient) {
        try {
          const settings = await apiClient.getSettings();
          setUserSettings(settings);
        } catch (error) { console.error('Failed to fetch user settings:', error); }
      }
    };
    fetchSettings();
  }, [apiClient]);

  const handleSaveSettings = async (settingsToSave: UserSettings) => {
    if (apiClient) {
      try {
        await apiClient.updateSettings(settingsToSave);
        setUserSettings(settingsToSave);
      } catch (error) {
        console.error('Failed to save settings:', error);
        throw error;
      }
    }
  };

  const handleSettingChange = (key: keyof UserSettings, value: any) => {
    setUserSettings(prev => ({ ...prev, [key]: value }));
  };

  if (!session) { return <AuthPage />; }

  const handleOpenAppSettings = () => setIsAppSettingsModalOpen(true);
  const handleCloseAppSettings = () => setIsAppSettingsModalOpen(false);
  const handleOpenAccountSettings = () => setIsAccountSettingsModalOpen(true);
  const handleCloseAccountSettings = () => setIsAccountSettingsModalOpen(false);
  const handleToggleMobileMenu = () => setIsMobileMenuOpen(prev => !prev);
  const handleClearRecognitionError = () => setRecognitionError(null);

  const user: DisplayUser = {
    name: authUser?.user_metadata?.full_name || authUser?.email || 'User',
    initials: (authUser?.user_metadata?.full_name || authUser?.email || 'U').charAt(0).toUpperCase(),
  };

  return (
    <div className="flex flex-col h-screen bg-immigo-gray-50 font-sans">
      <Header
        displayUser={user}
        userSettings={userSettings}
        onOpenAppSettings={handleOpenAppSettings}
        onOpenAccountSettings={handleOpenAccountSettings}
        onSignOut={logout}
        onToggleMobileMenu={handleToggleMobileMenu}
        onSettingChange={handleSettingChange}
      />
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden p-4 md:p-6 gap-6">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-star-white rounded-lg shadow-md overflow-hidden">
          <ConversationHistory
            messages={state.conversationHistory}
            isTranscribing={isTranscribing}
            transcript={transcript}
            currentBotMessage={currentBotMessage}
            recognitionError={recognitionError}
            onClearRecognitionError={handleClearRecognitionError}
          />
          {!isDesktop && (
            <div className="flex items-center p-2 bg-star-white border-t border-immigo-gray-200">
              <div className="flex-grow">
                <ChatInput onSendMessage={conversationManager.sendUserMessage} disabled={!state.isSessionActive} />
              </div>
              <VoiceHub
                isSessionActive={state.isSessionActive}
                sessionTime={state.sessionTime}
                onStartSession={conversationManager.startSession}
                onEndSession={conversationManager.endSession}
              />
            </div>
          )}
          {isDesktop && <ChatInput onSendMessage={conversationManager.sendUserMessage} disabled={!state.isSessionActive} />}
        </div>

        {/* Desktop Sidebar */}
        {isDesktop && (
          <aside className="w-72 flex-shrink-0">
            <ConversationHub
              status={state.appStatus}
              isSessionActive={state.isSessionActive}
              sessionTime={state.sessionTime}
              errorMessage={state.errorMessage}
              onStartSession={conversationManager.startSession}
              onEndSession={conversationManager.endSession}
              onClearError={() => dispatch({ type: 'SET_ERROR_MESSAGE', payload: null })}
              onClearConversation={conversationManager.clearConversation}
              onDownloadTranscript={conversationManager.downloadTranscript}
              onOpenAppSettings={handleOpenAppSettings}
              onOpenAccountSettings={handleOpenAccountSettings}
              userSettings={userSettings}
            />
          </aside>
        )}
      </main>
      <footer className="text-center py-3 bg-star-white text-immigo-gray-600 text-sm border-t border-immigo-gray-200">
        © {new Date().getFullYear()} ImmiGo. {isDesktop ? 'All rights reserved.' : ''}
      </footer>
      {isAppSettingsModalOpen && (
        <ApplicationSettingsModal isOpen={isAppSettingsModalOpen} onClose={handleCloseAppSettings} settings={userSettings} onSave={handleSaveSettings} onSettingChange={handleSettingChange} pollyVoices={PollyVoices} isDesktop={isDesktop} />
      )}
      {isAccountSettingsModalOpen && (
        <AccountSettingsPage onNavigateBack={handleCloseAccountSettings} isDesktop={isDesktop} />
      )}
      <MobileMenuOverlay isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} onOpenAppSettings={handleOpenAppSettings} onOpenAccountSettings={handleOpenAccountSettings} onSignOut={logout} onClearConversation={conversationManager.clearConversation} onDownloadTranscript={conversationManager.downloadTranscript} user={user} />
    </div>
  );
};

const App: React.FC = () => (
  <Router>
    <AuthProvider>
      <ConversationProvider apiClient={null}>
        <AppContent />
      </ConversationProvider>
    </AuthProvider>
  </Router>
);

export default App;