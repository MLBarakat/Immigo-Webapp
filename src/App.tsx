import React, { useEffect, useState, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';

import { ApplicationSettingsModal } from './components/ApplicationSettingsModal';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { ConversationHub } from './components/ConversationHub';
import { MobileMenu } from './components/MobileMenu';
import { ApiClient } from './services/apiClient';
import { UserSettings } from './types/settings';
import { ConversationProvider, useConversation } from './context/ConversationContext';
import { useConversationManager } from './hooks/useConversationManager';
import useMediaQuery from './hooks/useMediaQuery';
import { supabase } from './supabaseClient';
import { AuthPage } from './components/AuthPage';

const PollyVoices = [
  { id: 'Joanna', name: 'Joanna (US English)' },
  { id: 'Matthew', name: 'Matthew (US English)' },
  { id: 'Amy', name: 'Amy (British English)' },
  { id: 'Brian', name: 'Brian (British English)' },
];

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [isAppSettingsModalOpen, setIsAppSettingsModalOpen] = useState(false);
  const [userSettings, setUserSettings] = useState<Partial<UserSettings>>({});
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const apiClient = useMemo(() => {
    if (session?.access_token) {
      return new ApiClient(session.access_token);
    }
    return null;
  }, [session]);

  const conversationManager = useConversationManager({ apiClient });
  const { dispatch } = useConversation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

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

  const navigateToAccountSettings = () => navigate('/account-settings');
  const handleOpenAppSettings = () => isDesktop ? setIsAppSettingsModalOpen(true) : navigate('/app-settings');
  const handleCloseAppSettings = () => isDesktop ? setIsAppSettingsModalOpen(false) : navigate(-1);

  return (
    <div className={`flex flex-col h-screen ${userSettings.theme === 'dark' ? 'dark' : ''}`}>
      <Routes>
        <Route path="/" element={
          <ConversationHub
            status={conversationManager.appStatus}
            isSessionActive={conversationManager.isSessionActive}
            sessionTime={conversationManager.sessionTime}
            errorMessage={conversationManager.errorMessage}
            onStartSession={conversationManager.startSession}
            onEndSession={conversationManager.endSession}
            onClearError={() => dispatch({ type: 'SET_ERROR_MESSAGE', payload: null })}
            onClearConversation={conversationManager.clearConversation}
            onDownloadTranscript={conversationManager.downloadTranscript}
            onOpenAppSettings={handleOpenAppSettings}
            onOpenAccountSettings={navigateToAccountSettings}
            userSettings={userSettings}
          />
        } />
        <Route path="/account-settings" element={<AccountSettingsPage onNavigateBack={() => navigate('/')} isDesktop={isDesktop} />} />
        <Route path="/app-settings" element={
          !isDesktop && (
            <ApplicationSettingsModal
              isOpen={true}
              onClose={handleCloseAppSettings}
              settings={userSettings}
              onSave={handleSaveSettings}
              onSettingChange={handleSettingChange}
              pollyVoices={PollyVoices}
              isDesktop={isDesktop}
            />
          )
        } />
      </Routes>
      {isDesktop && isAppSettingsModalOpen && (
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
      {!isDesktop && (
        <MobileMenu
          onOpenAppSettings={handleOpenAppSettings}
          onOpenAccountSettings={navigateToAccountSettings}
          onSignOut={() => supabase.auth.signOut()}
        />
      )}
    </div>
  );
};

const App: React.FC = () => (
  <Router>
    <ConversationProvider apiClient={null}>
      <AppContent />
    </ConversationProvider>
  </Router>
);

export default App;