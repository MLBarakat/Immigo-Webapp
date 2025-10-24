import React, { useEffect, useState, useMemo } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { ApplicationSettingsModal } from './components/ApplicationSettingsModal';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { ConversationHub } from './components/ConversationHub';
import { MobileMenuOverlay } from './components/MobileMenuOverlay';
import { ApiClient, FeedbackResponse } from './services/apiClient';
import { UserSettings } from './types/settings';
import { ConversationProvider, useConversation } from './context/ConversationContext';
import { useConversationManager } from './hooks/useConversationManager';
import useMediaQuery from './hooks/useMediaQuery';
import { AuthPage } from './components/AuthPage';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ConversationHistory } from './components/ConversationHistory';
import { ChatInput } from './components/ChatInput';
import { VoiceHub } from './components/VoiceHub';
import { useAuth } from './hooks/useAuth';
import { AuthProvider } from './context/AuthContext';
import { DisplayUser } from './types/user';
import { ScrollToTop } from './components/ScrollToTop';
import { FeedbackModal } from './components/FeedbackModal';
import { analytics } from './analytics';

const PollyVoices = [
  { id: 'Joanna', name: 'Joanna (US English)' },
  { id: 'Matthew', name: 'Matthew (US English)' },
  { id: 'Amy', name: 'Amy (British English)' },
  { id: 'Brian', name: 'Brian (British English)' },
];

function AppContent(): JSX.Element {
  const { session, user: authUser, profile, logout, updateUserLanguage } = useAuth();
  const [isAppSettingsModalOpen, setIsAppSettingsModalOpen] = useState(false);
  const [isAccountSettingsModalOpen, setIsAccountSettingsModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userSettings, setUserSettings] = useState<Partial<UserSettings>>({});
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackData, setFeedbackData] = useState<FeedbackResponse | null>(null);
  const [isFetchingFeedback, setIsFetchingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const apiClient = useMemo(() => {
    if (session?.access_token) { return new ApiClient(session.access_token); }
    return null;
  }, [session]);

  const { state, dispatch } = useConversation();
  const conversationManager = useConversationManager({ apiClient, userSettings });

  // EFFECT TO APPLY THEME AND FONT SIZE
  useEffect(() => {
    // Theme application
    const root = window.document.documentElement;
    const isDark =
      userSettings.theme === 'dark' ||
      (userSettings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    root.classList.toggle('dark', isDark);

    // Font size application
    const body = window.document.body;
    body.classList.remove('text-sm', 'text-base', 'text-lg'); // Clear old classes
    switch (userSettings.font_size) {
      case 'small':
        body.classList.add('text-sm');
        break;
      case 'large':
        body.classList.add('text-lg');
        break;
      default:
        body.classList.add('text-base');
    }
  }, [userSettings.theme, userSettings.font_size]);

  useEffect(() => {
    const lang = profile?.language;
    if (lang) {
      dispatch({ type: 'SET_LANGUAGE', payload: lang });
    }

    const fetchSettings = async () => {
      if (apiClient) {
        try {
          const settings = await apiClient.getSettings();
          setUserSettings(settings);
        } catch (error) { console.error('Failed to fetch user settings:', error); }
      }
    };
    fetchSettings();
  }, [apiClient, dispatch, profile]);

  const handleSaveSettings = async (settingsToSave: UserSettings) => {
    if (apiClient) {
        await apiClient.updateSettings(settingsToSave);
        setUserSettings(settingsToSave);
    }
  };

  const handleSettingChange = async (key: keyof UserSettings, value: unknown) => {
    const newSettings = { ...userSettings, [key]: value };
    setUserSettings(newSettings);
    if (apiClient) {
      try {
        await apiClient.updateSettings({ [key]: value });
      } catch (error) {
        console.error("Failed to save setting:", error);
      }
    }
  };

  if (!session) { return <AuthPage />; }

  const handleOpenAppSettings = () => setIsAppSettingsModalOpen(true);
  const handleCloseAppSettings = () => setIsAppSettingsModalOpen(false);
  const handleOpenAccountSettings = () => setIsAccountSettingsModalOpen(true);
  const handleCloseAccountSettings = () => setIsAccountSettingsModalOpen(false);
  const handleToggleMobileMenu = () => setIsMobileMenuOpen(prev => !prev);

  const handleLanguageChange = (newLanguageCode: string) => {
    dispatch({ type: 'SET_LANGUAGE', payload: newLanguageCode });
    updateUserLanguage(newLanguageCode).catch((error: any) => {
      console.error("UI failed to sync language update:", error);
    });
  };

  const handleRequestFeedback = async () => {
    if (!apiClient || conversationManager.conversationHistory.length === 0) return;

    analytics.track('feedback_requested');

    setIsFetchingFeedback(true);
    setIsFeedbackModalOpen(true);
    setFeedbackError(null);
    setFeedbackData(null);

    try {
      const data = await apiClient.getAnalysis(conversationManager.conversationHistory);
      setFeedbackData(data);
      analytics.track('feedback_received_success');
    } catch (error) {
      console.error("Failed to get feedback:", error);
      setFeedbackError(error instanceof Error ? error.message : "An unknown error occurred.");
      analytics.track('feedback_received_failure');
    } finally {
      setIsFetchingFeedback(false);
    }
  };

  const handleCloseFeedbackModal = () => {
    setIsFeedbackModalOpen(false);
  };

  const user: DisplayUser = {
    name: authUser?.user_metadata?.full_name as string || authUser?.email || 'User',
    initials: (authUser?.user_metadata?.full_name as string || authUser?.email || 'U').charAt(0).toUpperCase(),
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
        currentLanguageCode={state.currentLanguageCode}
        onLanguageChange={handleLanguageChange}
      />
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden p-4 md:p-6 gap-6">
        <div className="flex-1 flex flex-col bg-star-white rounded-lg shadow-md overflow-hidden">
          <ConversationHistory
            messages={conversationManager.conversationHistory}
            displayUser={user}
            isTranscribing={conversationManager.isTranscribing}
            transcript={conversationManager.transcript}
          />
          {isDesktop ? (
            <div className="border-t border-immigo-gray-200">
                <ChatInput onSendMessage={conversationManager.sendTextMessage} disabled={conversationManager.appStatus !== 'idle'} />
            </div>
          ) : (
            <div className="flex items-center p-2 bg-star-white border-t border-immigo-gray-200">
              <div className="flex-grow">
                <ChatInput onSendMessage={conversationManager.sendTextMessage} disabled={conversationManager.appStatus !== 'idle'} />
              </div>
              <VoiceHub
                status={conversationManager.appStatus}
                isSessionActive={conversationManager.isSessionActive}
                sessionTime={conversationManager.sessionTime}
                onStartSession={conversationManager.startSession}
                onEndSession={conversationManager.endSession}
              />
            </div>
          )}
        </div>

        {isDesktop && (
          <aside className="w-72 flex-shrink-0">
            <ConversationHub
              status={conversationManager.appStatus}
              isSessionActive={conversationManager.isSessionActive}
              sessionTime={conversationManager.sessionTime}
              errorMessage={conversationManager.errorMessage}
              onStartSession={conversationManager.startSession}
              onEndSession={conversationManager.endSession}
              onClearError={conversationManager.clearError}
              onClearConversation={conversationManager.clearConversation}
              onDownloadTranscript={conversationManager.downloadTranscript}
              onOpenAppSettings={handleOpenAppSettings}
              onOpenAccountSettings={handleOpenAccountSettings}
              userSettings={userSettings}
              onGetFeedback={handleRequestFeedback}
              isFeedbackDisabled={conversationManager.conversationHistory.length === 0}
            />
          </aside>
        )}
      </main>
      <Footer />
      {isAppSettingsModalOpen && (
        <ApplicationSettingsModal isOpen={isAppSettingsModalOpen} onClose={handleCloseAppSettings} settings={userSettings} onSave={handleSaveSettings} onSettingChange={handleSettingChange} pollyVoices={PollyVoices} isDesktop={isDesktop} />
      )}
      {isAccountSettingsModalOpen && (
        <AccountSettingsPage onNavigateBack={handleCloseAccountSettings} isDesktop={isDesktop} />
      )}
      {isFeedbackModalOpen && (
        <FeedbackModal
          isOpen={isFeedbackModalOpen}
          onClose={handleCloseFeedbackModal}
          isLoading={isFetchingFeedback}
          feedback={feedbackData}
          error={feedbackError}
        />
      )}
      <MobileMenuOverlay isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} onOpenAppSettings={handleOpenAppSettings} onOpenAccountSettings={handleOpenAccountSettings} onSignOut={logout} onClearConversation={conversationManager.clearConversation} onDownloadTranscript={conversationManager.downloadTranscript} user={user} />
    </div>
  );
}

function App(): JSX.Element {
  return (
    <Router>
      <AuthProvider>
        <ConversationProvider apiClient={null}>
          <ScrollToTop />
          <AppContent />
        </ConversationProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
