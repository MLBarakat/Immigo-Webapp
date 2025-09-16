import React, { useEffect, useState, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';

import { ApplicationSettingsModal } from './components/ApplicationSettingsModal';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { ConversationHub } from './components/ConversationHub';
import { MobileMenu } from './components/MobileMenu';
import { ApiClient } from './services/apiClient';
import { UserSettings } from './types/settings';
import { ConversationProvider } from './context/ConversationContext';
import useMediaQuery from './hooks/useMediaQuery';
import { supabase } from './supabaseClient';
import { AuthPage } from './components/AuthPage'; // Import the custom Auth Page

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
        console.log('Settings saved:', settingsToSave);
      } catch (error) {
        console.error('Failed to save settings:', error);
        throw error; // Re-throw to allow modal to show error
      }
    }
  };

  const handleSettingChange = (key: keyof UserSettings, value: any) => {
    setUserSettings(prev => ({ ...prev, [key]: value }));
  };

  if (!session) {
    return <AuthPage />; // Use the custom AuthPage component
  }

  const navigateToAccountSettings = () => {
    navigate('/account-settings');
  };

  const handleOpenAppSettings = () => {
    if (isDesktop) {
      setIsAppSettingsModalOpen(true);
    } else {
      navigate('/app-settings');
    }
  };

  const handleCloseAppSettings = () => {
    if (isDesktop) {
      setIsAppSettingsModalOpen(false);
    } else {
      navigate(-1); // Go back for mobile full-screen
    }
  };

  return (
    <ConversationProvider apiClient={apiClient}>
      <div className={`flex flex-col h-screen ${userSettings.theme === 'dark' ? 'dark' : ''}`}>
        <Routes>
          <Route path="/" element={
            <ConversationHub
              onOpenAppSettings={handleOpenAppSettings}
              onOpenAccountSettings={navigateToAccountSettings}
              userSettings={userSettings}
            />
          } />
          <Route path="/account-settings" element={
            <AccountSettingsPage
              onNavigateBack={() => navigate('/')}
              isDesktop={isDesktop}
            />
          } />
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
    </ConversationProvider>
  );
};

const App: React.FC = () => (
  <Router>
    <AppContent />
  </Router>
);

export default App;