import React, { useEffect, useState, useCallback } from 'react';
import { ConversationProvider, useConversation } from './context/ConversationContext';
import { useAuth } from './hooks/useAuth';
import { useConversationManager } from './hooks/useConversationManager';
import { ConversationHistory } from './components/ConversationHistory';
import { ChatInput } from './components/ChatInput';
import { UserProfile } from './components/UserProfile';
import { AuthPage } from './components/AuthPage';
import { WelcomeModal } from './components/WelcomeModal';
import { ConversationHub } from './components/ConversationHub';
import { ApplicationSettingsModal } from './components/ApplicationSettingsModal';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { ApiClient } from './services/apiClient';
import ImmigoLogo from './assets/immigo_logo.png';
import { UserSettings, ThemeOption } from './types/settings';

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
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [userSettings, setUserSettings] = useState<Partial<UserSettings>>({});
  const [apiClient, setApiClient] = useState<ApiClient | null>(null);


  // Initialize ApiClient when session is available
  useEffect(() => {
    if (session) {
      const client = new ApiClient(session.access_token);
      setApiClient(client);
    } else {
      setApiClient(null);
    }
  }, [session]);

  // Fetch user settings
  useEffect(() => {
    const fetchSettings = async () => {
      if (apiClient) {
        try {
          const fetchedSettings = await apiClient.getSettings();
          setUserSettings(fetchedSettings);
          // Apply theme immediately
          document.documentElement.className = fetchedSettings.theme || 'system';
          dispatch({ type: 'SET_VOICE', payload: fetchedSettings.ai_voice_id || 'Joanna' });
        } catch (error) {
          console.error("Failed to fetch user settings:", error);
        }
      }
    };
    fetchSettings();
  }, [apiClient, dispatch]);

  // Welcome modal logic
  useEffect(() => {
    const hasSeenWelcome = sessionStorage.getItem('hasSeenWelcome');
    if (!hasSeenWelcome) {
      setShowWelcome(true);
      sessionStorage.setItem('hasSeenWelcome', 'true');
    }
  }, []);

  // Fetch conversation history
  useEffect(() => {
    const fetchHistory = async () => {
      if (apiClient) {
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
  }, [apiClient, dispatch, logout]);

  const handleClearError = () => dispatch({ type: 'CLEAR_ERROR' });
  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => dispatch({ type: 'SET_VOICE', payload: e.target.value });
  const isInputDisabled = state.appStatus !== 'idle' && state.appStatus !== 'error' && !state.isSessionActive;
  const userName = user?.user_metadata?.full_name || user?.email || 'User';
  const userInitials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

  const handleSettingChange = useCallback((key: keyof UserSettings, value: any) => {
    setUserSettings(prevSettings => ({
      ...prevSettings,
      [key]: value
    }));
    if (key === 'theme') {
      document.documentElement.className = value as ThemeOption;
    }
    if (key === 'ai_voice_id') {
      dispatch({ type: 'SET_VOICE', payload: value as string });
    }
  }, [dispatch]);

  const handleSaveSettings = useCallback(async (settingsToSave: UserSettings) => {
    if (apiClient) {
      try {
        const updated = await apiClient.updateSettings(settingsToSave);
        setUserSettings(updated);
        console.log('Settings saved:', updated);
      } catch (error) {
        console.error("Failed to save settings:", error);
        throw error;
      }
    }
  }, [apiClient]);

  return (
    <>
      {showWelcome && <WelcomeModal userName={userName} onClose={() => setShowWelcome(false)} />}
      {showAppSettings && (
        <ApplicationSettingsModal
          isOpen={showAppSettings}
          onClose={() => setShowAppSettings(false)}
          settings={userSettings}
          onSave={handleSaveSettings}
          onSettingChange={handleSettingChange}
          pollyVoices={pollyVoices}
        />
      )}
      {showAccountSettings && (
        <AccountSettingsPage
          isOpen={showAccountSettings}
          onClose={() => setShowAccountSettings(false)}
          user={user}
          logout={logout}
        />
      )}
      <div className="h-screen bg-gradient-to-br from-immigo-gray-50 via-star-white to-immigo-gray-50 flex flex-col font-sans">
        <header className="bg-star-white shadow-xl border-b-4 border-art-blue-600 px-4 sm:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="relative w-12 h-12 sm:w-16 sm:h-16">
                <img src={ImmigoLogo} alt="Immigo Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-display bg-gradient-to-r from-art-red-700 via-art-blue-700 to-deep-navy bg-clip-text text-transparent drop-shadow-lg">ImmiGo</h1>
                <p className="text-deep-navy font-semibold text-sm sm:text-lg">Your AI Conversation Partner</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <select value={state.voiceId} onChange={handleVoiceChange} className="bg-immigo-gray-100 border-2 p-2 rounded-lg text-sm">
                {pollyVoices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
              </select>
              {user &&
                <UserProfile
                  user={{ name: userName, initials: userInitials }}
                  onLogout={logout}
                  onOpenAppSettings={() => setShowAppSettings(true)}
                  onOpenAccountSettings={() => setShowAccountSettings(true)}
                />
              }
            </div>
          </div>
        </header>
        <main className="flex-1 flex flex-col lg:flex-row overflow-hidden p-2 sm:p-4 lg:p-6 gap-4 lg:gap-6 bg-immigo-gray-100">
          <div className="flex-1 flex flex-col bg-star-white shadow-xl border rounded-2xl overflow-hidden h-full">
            <ConversationHistory messages={state.conversationHistory} />
            <ConversationHub
              status={state.appStatus}
              isSessionActive={state.isSessionActive}
              sessionTime={state.sessionTime}
              errorMessage={state.errorMessage}
              onStartSession={startSession}
              onEndSession={endSession}
              onClearError={handleClearError}
            />
            <ChatInput onSendMessage={sendTextMessage} disabled={!state.isSessionActive || isInputDisabled} />
          </div>
        </main>
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