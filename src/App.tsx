import React, { useEffect, useState, useMemo } from 'react';
import { BrowserRouter as Router, useNavigate } from 'react-router-dom';
import { ApplicationSettingsModal } from './components/ApplicationSettingsModal';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { ConversationHub } from './components/ConversationHub';
import { MobileMenu } from './components/MobileMenu';
import { ApiClient } from './services/apiClient';
import { UserSettings } from './types/settings';
import { ConversationProvider, useConversation } from './context/ConversationContext';
import { useConversationManager } from './hooks/useConversationManager';
import useMediaQuery from './hooks/useMediaQuery';
import { AuthPage } from './components/AuthPage';
import { Header } from './components/Header';
import { ConversationHistory } from './components/ConversationHistory';
import { ChatInput } from './components/ChatInput';
import { useAuth, AuthProvider } from './hooks/useAuth';

const PollyVoices = [
  { id: 'Joanna', name: 'Joanna (US English)' },
  { id: 'Matthew', name: 'Matthew (US English)' },
  { id: 'Amy', name: 'Amy (British English)' },
  { id: 'Brian', name: 'Brian (British English)' },
];

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const [isAppSettingsModalOpen, setIsAppSettingsModalOpen] = useState(false);
  const [isAccountSettingsModalOpen, setIsAccountSettingsModalOpen] = useState(false);
  const [userSettings, setUserSettings] = useState<Partial<UserSettings>>({});
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const apiClient = useMemo(() => {
    if (session?.access_token) {
      return new ApiClient(session.access_token);
    }
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
        } catch (error) {
          console.error('Failed to fetch user settings:', error);
        }
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

  if (!session) {
    return <AuthPage />;
  }

  const handleOpenAppSettings = () => setIsAppSettingsModalOpen(true);
  const handleCloseAppSettings = () => setIsAppSettingsModalOpen(false);
  const handleOpenAccountSettings = () => setIsAccountSettingsModalOpen(true);
  const handleCloseAccountSettings = () => setIsAccountSettingsModalOpen(false);

  return (
    <div className={`flex flex-col h-screen bg-immigo-gray-50 font-sans ${userSettings.theme === 'dark' ? 'dark' : ''}`}>
      <Header
        onOpenAppSettings={handleOpenAppSettings}
        onLogout={logout}
        user={{ name: session.user?.user_metadata?.full_name || 'User', initials: 'MB' }}
      />
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 flex flex-col p-4 lg:p-6 overflow-hidden">
          <ConversationHistory messages={state.conversationHistory} />
          <ChatInput onSendMessage={conversationManager.sendUserMessage} disabled={!state.isSessionActive} />
        </div>
        {isDesktop && (
          <aside className="w-full lg:w-96 p-6 flex-shrink-0">
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
      <footer className="text-center py-2 bg-immigo-gray-100 border-t border-immigo-gray-200 text-xs text-immigo-gray-600">
        © 2025 ImmiGo. All rights reserved.
      </footer>
      {isAppSettingsModalOpen && (
        <ApplicationSettingsModal
          isOpen={isAppSettingsModalOpen}
          onClose={handleCloseAppSettings}
          settings={userSettings}
          onSave={handleSaveSettings}
          onSettingChange={handleSettingChange}
          pollyVoices={PollyVoices}
          isDesktop={isDesktop}
        />
      )}
      {isAccountSettingsModalOpen && (
        <AccountSettingsPage onNavigateBack={handleCloseAccountSettings} isDesktop={isDesktop} />
      )}
       {!isDesktop && (
        <MobileMenu
          onOpenAppSettings={handleOpenAppSettings}
          onOpenAccountSettings={handleOpenAccountSettings}
          onSignOut={logout}
        />
      )}
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