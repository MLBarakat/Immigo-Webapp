import { useState, useMemo } from 'react';
import { Amplify } from 'aws-amplify';
import amplifyOutputs from '../amplify_outputs.json';

import { TranscriptionProvider } from './context/TranscriptionContext';
import { ConversationProvider } from './context/ConversationContext';
import { useConversation } from './hooks/useConversation';
import { ApiClient } from './services/apiClient';

import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { AuthPage } from './components/AuthPage';

import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ConversationHistory } from './components/ConversationHistory';
import { ChatInput } from './components/ChatInput';
import { VoiceHub } from './components/VoiceHub';
import { WelcomeModal } from './components/WelcomeModal';
import { ApplicationSettingsModal } from './components/ApplicationSettingsModal';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { MobileMenuOverlay } from './components/MobileMenuOverlay';

import { DisplayUser } from './types/user';
import { UserSettings } from './types/settings';
import { logger } from './logger';

try {
  if (amplifyOutputs) {
    Amplify.configure(amplifyOutputs);
    logger.info('AWS Amplify Gen 2 ecosystem parameters successfully bound to runtime execution context.');
  }
} catch (configError) {
  logger.warn('Amplify Sandbox metadata file unavailable.', { error: String(configError) });
}

interface ConversationWorkspaceProps {
  readonly apiClientInstance: ApiClient | null;
}

function ConversationWorkspace({ apiClientInstance }: ConversationWorkspaceProps): JSX.Element {
  const { user, profile, logout } = useAuth();
  const manager = useConversation({ apiClient: apiClientInstance, userId: user?.id ?? null });

  // UI Modal State Management
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Settings Management
  const [userSettings, setUserSettings] = useState<Partial<UserSettings>>({
    theme: 'system',
    live_feedback_enabled: true,
    mic_mode: 'voice_activity',
    barge_in: 'balanced',
    progress_report_frequency: 'after_session',
    font_size: 'default'
  });
  const [currentLanguageCode, setCurrentLanguageCode] = useState('en');

  const displayUser: DisplayUser = {
    name: profile?.full_name || user?.email || 'User',
    initials: (profile?.full_name || user?.email || 'U').substring(0, 2).toUpperCase()
  };

  const handleSettingChange = (key: keyof UserSettings, value: unknown) => {
    setUserSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    /* FIXED: Enforced h-screen and overflow-hidden to lock the app to the viewport size exactly */
    <div className="flex flex-col h-screen w-full bg-immigo-gray-50 text-deep-navy font-sans antialiased overflow-hidden">

      {/* Absolute Positioning Overlays */}
      {showWelcomeModal && <WelcomeModal userName={displayUser.name} onClose={() => setShowWelcomeModal(false)} />}

      {showAppSettings && (
        <ApplicationSettingsModal
          isOpen={showAppSettings}
          settings={userSettings}
          onSettingChange={handleSettingChange}
          pollyVoices={[]}
          isDesktop={typeof window !== 'undefined' ? window.innerWidth >= 768 : true}
          onClose={() => setShowAppSettings(false)}
          onSave={async (newSettings) => {
            setUserSettings({ ...userSettings, ...newSettings });
            setShowAppSettings(false);
          }}
        />
      )}

      {showAccountSettings && (
        <AccountSettingsPage
          onNavigateBack={() => setShowAccountSettings(false)}
          isDesktop={typeof window !== 'undefined' ? window.innerWidth >= 768 : true}
        />
      )}

      <MobileMenuOverlay
        isOpen={showMobileMenu}
        onClose={() => setShowMobileMenu(false)}
        onOpenAppSettings={() => { setShowMobileMenu(false); setShowAppSettings(true); }}
        onOpenAccountSettings={() => { setShowMobileMenu(false); setShowAccountSettings(true); }}
        onSignOut={logout}
        onClearConversation={manager.clearConversation}
        onDownloadTranscript={manager.downloadTranscript}
        user={displayUser}
      />

      {/* Global Navigation Layout */}
      <Header
        displayUser={displayUser}
        userSettings={userSettings}
        onOpenAppSettings={() => setShowAppSettings(true)}
        onOpenAccountSettings={() => setShowAccountSettings(true)}
        onSignOut={logout}
        onToggleMobileMenu={() => setShowMobileMenu(true)}
        onSettingChange={handleSettingChange}
        currentLanguageCode={currentLanguageCode}
        onLanguageChange={setCurrentLanguageCode}
      />

      {/* FIXED: min-h-0 prevents children from breaking out of the strict flex bounds */}
      <main className="flex-grow flex max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 gap-6 justify-center items-stretch min-h-0">

        {/* Left Hand: Scrollable Chat Window Area */}
        <section className="flex-grow flex flex-col bg-star-white rounded-xl shadow-md p-4 md:p-6 overflow-hidden relative border border-immigo-gray-200 min-h-0 w-full">

          {/* FIXED: Removed redundant AudioRecorder (and its placeholder text/button) completely */}

          {manager.errorMessage && (
            <div className="p-4 mb-4 bg-art-red-50 border-l-4 border-art-red-600 rounded text-sm text-art-red-800 flex justify-between items-center shrink-0" role="alert">
              <p className="font-medium">System Intercept Exception: {manager.errorMessage}</p>
              <button onClick={manager.clearError} className="text-xs underline hover:text-art-red-900 cursor-pointer">Acknowledge</button>
            </div>
          )}

          {/* Core Chat Scroll Viewport */}
          <div className="flex-1 overflow-y-auto flex flex-col mb-4 min-h-0">
            {manager.conversationHistory.length > 0 || manager.interimTranscript ? (
              <ConversationHistory
                messages={manager.conversationHistory}
                displayUser={displayUser}
                interimTranscript={manager.interimTranscript}
                onLoadOlder={manager.loadOlderMessages}
                hasMore={manager.hasMoreHistory}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 opacity-75">
                <p className="text-sm text-immigo-gray-500 italic">No conversational messages logged in active workspace buffer.</p>
                <p className="text-xs text-immigo-gray-400 mt-2">Tap the microphone control interface to begin training.</p>
              </div>
            )}
          </div>

          {/* Desktop/Mobile Universal Text Interface */}
          <div className="border-t border-immigo-gray-200 pt-4 mt-auto shrink-0">
            <ChatInput onSendMessage={manager.sendTextMessage} disabled={manager.isSessionActive} />
          </div>

          {/* Mobile Footer Voice Hub (Hidden on Desktop) */}
          <div className="md:hidden flex justify-center mt-4 border-t border-immigo-gray-200 pt-4 shrink-0">
            <VoiceHub
              status={manager.appStatus}
              isSessionActive={manager.isSessionActive}
              sessionTime={manager.sessionTime}
              onStartSession={manager.startSession}
              onEndSession={manager.endSession}
            />
          </div>
        </section>

        {/* Right Hand: Fixed Tool Sidebar (Hidden on Mobile) */}
        <aside className="hidden md:flex w-72 flex-col shrink-0 bg-star-white rounded-xl shadow-md p-6 space-y-6 border border-immigo-gray-200 overflow-y-auto">
          <div className="flex flex-col space-y-3 pb-6 border-b border-immigo-gray-200">
            <button
              onClick={manager.clearConversation}
              disabled={manager.conversationHistory.length === 0}
              className="flex items-center justify-center p-3 rounded-lg hover:bg-immigo-gray-100 text-sm font-medium transition-colors border border-immigo-gray-200 text-immigo-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="mr-2 text-lg">🗑️</span> Clear Conversation
            </button>
            <button
              onClick={manager.downloadTranscript}
              disabled={manager.conversationHistory.length === 0}
              className="flex items-center justify-center p-3 rounded-lg hover:bg-immigo-gray-100 text-sm font-medium transition-colors border border-immigo-gray-200 text-immigo-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="mr-2 text-lg">⬇️</span> Download Script
            </button>
          </div>

          <VoiceHub
            status={manager.appStatus}
            isSessionActive={manager.isSessionActive}
            sessionTime={manager.sessionTime}
            onStartSession={manager.startSession}
            onEndSession={manager.endSession}
          />
        </aside>

      </main>
      <Footer />
    </div>
  );
}

function AppContent() {
  const { session, loading } = useAuth();

  const apiClientInstance = useMemo(() => {
    if (!session?.access_token) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dynamicGatewayUrl = (amplifyOutputs as any)?.custom?.apiBaseUrl;
      return new ApiClient(session.access_token, dynamicGatewayUrl);
    } catch (error) {
      logger.error('Client layer initialization crash exception', undefined, { error: String(error) });
      return null;
    }
  }, [session?.access_token]);

  if (loading) {
    return (
      <div className="h-screen w-full bg-deep-navy flex flex-col items-center justify-center text-star-white p-6" role="alert" aria-busy="true">
        <div className="w-10 h-10 border-4 border-art-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-base font-bold tracking-wide">Securing Processing Environment…</h2>
      </div>
    );
  }

  if (!session) return <AuthPage />;

  return (
    <TranscriptionProvider>
      <ConversationProvider>
        <ConversationWorkspace apiClientInstance={apiClientInstance} />
      </ConversationProvider>
    </TranscriptionProvider>
  );
}

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}