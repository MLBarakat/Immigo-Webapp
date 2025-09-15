import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { createClient } from '@supabase/supabase-js';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';

import { ApplicationSettingsModal } from './components/ApplicationSettingsModal';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { ConversationHub } from './components/ConversationHub';
import { MobileMenu } from './components/MobileMenu';
import { ApiClient } from './services/apiClient';
import { UserSettings } from './types/settings';
import { ConversationProvider } from './context/ConversationContext';
import useMediaQuery from './hooks/useMediaQuery'; // NEW

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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
  const isDesktop = useMediaQuery('(min-width: 1024px)'); // NEW: Using the hook

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

  const handleSaveSettings = useCallback(async (settingsToSave: UserSettings) => {
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
  }, [apiClient]);

  const handleSettingPreview = useCallback((key: keyof UserSettings, value: any) => {
    setUserSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  if (!session) {
    return (
      <div className="flex justify-center items-center h-screen bg-immigo-gray-100 p-4">
        <div className="w-full max-w-md bg-star-white p-8 rounded-lg shadow-lg">
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            providers={['google']}
          />
        </div>
      </div>
    );
  }

  const navigateToAccountSettings = () => {
    if (isDesktop) {
      // Account settings is a full page, so always navigate for now.
      // This could be changed to a modal if needed in the future.
      navigate('/account-settings');
    } else {
      navigate('/account-settings');
    }
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
        {/* Main content - ConversationHub, potentially with MobileMenu */}
        <Routes>
          <Route path="/" element={
            <ConversationHub
              onOpenAppSettings={handleOpenAppSettings}
              onOpenAccountSettings={navigateToAccountSettings}
              apiClient={apiClient}
              userSettings={userSettings}
            />
          } />
          <Route path="/account-settings" element={
            <AccountSettingsPage
              onNavigateBack={() => navigate('/')}
              isDesktop={isDesktop} // NEW prop
            />
          } />
          <Route path="/app-settings" element={
            !isDesktop && ( // Only render this route for mobile
              <ApplicationSettingsModal
                isOpen={true} // Always open when on this route
                onClose={handleCloseAppSettings}
                settings={userSettings}
                onSave={handleSaveSettings}
                onSettingPreview={handleSettingPreview}
                pollyVoices={PollyVoices}
                isDesktop={isDesktop} // NEW prop
              />
            )
          } />
        </Routes>

        {/* Application Settings Modal (Desktop Only) */}
        {isDesktop && isAppSettingsModalOpen && (
          <ApplicationSettingsModal
            isOpen={isAppSettingsModalOpen}
            onClose={handleCloseAppSettings}
            settings={userSettings}
            onSave={handleSaveSettings}
            onSettingPreview={handleSettingPreview}
            pollyVoices={PollyVoices}
            isDesktop={isDesktop} // NEW prop
          />
        )}

        {/* Mobile Menu for Navigation (Desktop hides it) */}
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