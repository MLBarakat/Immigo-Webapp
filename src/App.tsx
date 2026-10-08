import { useState, useMemo } from 'react';
import { BookOpen, MessageSquare, SlidersHorizontal } from 'lucide-react';
import { Amplify } from 'aws-amplify';
import { useTranslation } from 'react-i18next';
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
import { WelcomeModal } from './components/WelcomeModal';
import { ApplicationSettingsModal } from './components/ApplicationSettingsModal';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { MobileMenuOverlay } from './components/MobileMenuOverlay';
import { LeftPanel } from './components/LeftPanel';
import { CenterPanel } from './components/CenterPanel';
import { RightPanel } from './components/RightPanel';
import type { SimulationMode } from './context/conversationContextTypes';

import { DisplayUser } from './types/user';
import { UserSettings, FontSize } from './types/settings';
import { applyFontSize } from './utils/fontSize';
import { logger } from './logger';
import useMediaQuery from './hooks/useMediaQuery';
import { normalizeAppLanguage } from './i18n';
import { I18nProvider } from './i18n/I18nProvider';
import { APP_VOICES, getDefaultVoiceId, normalizeVoiceId } from './constants/voices';

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
  const { user, profile, logout, userSettings, updateUserSettings, updateUserLanguage } = useAuth();
  const { t: tConversation } = useTranslation('conversation');
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('standard');
  const currentLanguageCode = normalizeAppLanguage(userSettings.language || profile?.language);

  const activeVoiceId = normalizeVoiceId(
    userSettings.ai_voice_id ?? getDefaultVoiceId(userSettings.language || profile?.language)
  );
  const manager = useConversation({
    apiClient: apiClientInstance,
    userId: user?.id ?? null,
    voiceId: activeVoiceId,
    simulationMode,
    preferredLanguage: currentLanguageCode,
  });

  // ── UI State ──
  const hasSeenWelcome = Boolean(
    userSettings.has_seen_welcome ||
    (user?.id && (() => {
      try { return localStorage.getItem(`immigo_welcome_seen_${user.id}`) === 'true'; }
      catch { return false; }
    })())
  );
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const showWelcomeModal = !hasSeenWelcome && !welcomeDismissed;

  const handleCloseWelcome = () => {
    setWelcomeDismissed(true);
    if (user?.id) {
      try { localStorage.setItem(`immigo_welcome_seen_${user.id}`, 'true'); }
      catch { /* ignore */ }
    }
    void updateUserSettings({ has_seen_welcome: true });
  };

  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // ── Panel collapse state ──
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [mobileWorkspace, setMobileWorkspace] = useState<'interview' | 'resources' | 'controls'>('interview');

  const displayUser: DisplayUser = {
    name: profile?.full_name || user?.email || 'User',
    initials: (() => {
      const fullName = profile?.full_name?.trim();
      if (fullName) {
        const parts = fullName.split(/\s+/);
        if (parts.length >= 2) {
          return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return parts[0].substring(0, 2).toUpperCase();
      }
      return (user?.email || 'U').substring(0, 2).toUpperCase();
    })(),
  };

  const handleSettingChange = (key: keyof UserSettings, value: unknown) => {
    if (key === 'font_size') applyFontSize(value as FontSize);
    void updateUserSettings({ [key]: value } as Partial<UserSettings>);
  };
  const isFocusMode = leftCollapsed && rightCollapsed;
  const toggleFocusMode = () => {
    const shouldCollapse = !isFocusMode;
    setLeftCollapsed(shouldCollapse);
    setRightCollapsed(shouldCollapse);
  };

  // ── Mobile layout ──
  if (!isDesktop) {
    return (
      <div className="flex flex-col h-dvh w-full bg-immigo-gray-50 text-deep-navy font-sans antialiased overflow-hidden">
        {showWelcomeModal && <WelcomeModal userName={displayUser.name} onClose={handleCloseWelcome} />}
        {showAppSettings && (
          <ApplicationSettingsModal
            isOpen={showAppSettings}
            settings={userSettings}
            pollyVoices={APP_VOICES.map(v => ({ id: v.id, name: v.displayName }))}
            isDesktop={false}
            onClose={() => setShowAppSettings(false)}
            onSave={async (newSettings) => { await updateUserSettings(newSettings); setShowAppSettings(false); }}
          />
        )}
        {showAccountSettings && (
          <AccountSettingsPage onNavigateBack={() => setShowAccountSettings(false)} isDesktop={false} />
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
          userSettings={userSettings}
          currentLanguageCode={currentLanguageCode}
          onLanguageChange={(code) => { void updateUserLanguage(code); }}
          onSettingChange={handleSettingChange}
        />
        <Header
          displayUser={displayUser}
          userSettings={userSettings}
          onOpenAppSettings={() => setShowAppSettings(true)}
          onOpenAccountSettings={() => setShowAccountSettings(true)}
          onSignOut={logout}
          onToggleMobileMenu={() => setShowMobileMenu(true)}
          onSettingChange={handleSettingChange}
          currentLanguageCode={currentLanguageCode}
          onLanguageChange={(code) => { void updateUserLanguage(code); }}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          {mobileWorkspace === 'resources' && (
            <LeftPanel
              isCollapsed={false}
              isMobile
              onToggleCollapse={() => setMobileWorkspace('interview')}
              liveStats={manager.liveStats}
              conversationLength={manager.conversationHistory.length}
              userId={user?.id}
              isGeneratingProgressReport={manager.isGeneratingProgressReport}
            />
          )}
          {mobileWorkspace === 'interview' && (
            <CenterPanel
              conversationHistory={manager.conversationHistory}
              displayUser={displayUser}
              interimTranscript={manager.interimTranscript}
              appStatus={manager.appStatus}
              isSessionActive={manager.isSessionActive}
              sessionTime={manager.sessionTime}
              errorMessage={manager.errorMessage}
              hasMoreHistory={manager.hasMoreHistory}
              onSendMessage={manager.sendTextMessage}
              onStartSession={manager.startSession}
              onEndSession={manager.endSession}
              onLoadOlder={manager.loadOlderMessages}
              onClearError={manager.clearError}
            />
          )}
          {mobileWorkspace === 'controls' && (
            <RightPanel
              isCollapsed={false}
              isMobile
              onToggleCollapse={() => setMobileWorkspace('interview')}
              simulationMode={simulationMode}
              onSimulationModeChange={setSimulationMode}
              onClearSession={manager.clearConversation}
              onDownloadTranscript={manager.downloadTranscript}
              conversationLength={manager.conversationHistory.length}
              appStatus={manager.appStatus}
            />
          )}
        </div>
        <nav className="grid grid-cols-3 border-t border-immigo-gray-200 bg-star-white shrink-0" aria-label={tConversation('workspace.mobile.navigation')}>
          <button
            type="button"
            onClick={() => setMobileWorkspace('resources')}
            aria-current={mobileWorkspace === 'resources' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-1 py-2 text-xs font-semibold ${mobileWorkspace === 'resources' ? 'text-art-blue-700 bg-art-blue-50' : 'text-immigo-gray-600'}`}
          >
            <BookOpen className="w-5 h-5" />
            {tConversation('workspace.mobile.resources')}
          </button>
          <button
            type="button"
            onClick={() => setMobileWorkspace('interview')}
            aria-current={mobileWorkspace === 'interview' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-1 py-2 text-xs font-semibold ${mobileWorkspace === 'interview' ? 'text-art-blue-700 bg-art-blue-50' : 'text-immigo-gray-600'}`}
          >
            <MessageSquare className="w-5 h-5" />
            {tConversation('workspace.mobile.interview')}
          </button>
          <button
            type="button"
            onClick={() => setMobileWorkspace('controls')}
            aria-current={mobileWorkspace === 'controls' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-1 py-2 text-xs font-semibold ${mobileWorkspace === 'controls' ? 'text-art-blue-700 bg-art-blue-50' : 'text-immigo-gray-600'}`}
          >
            <SlidersHorizontal className="w-5 h-5" />
            {tConversation('workspace.mobile.controls')}
          </button>
        </nav>
        <Footer />
      </div>
    );
  }

  // ── Desktop three-panel layout ──
  return (
    <div className="flex flex-col h-dvh w-full bg-immigo-gray-50 text-deep-navy font-sans antialiased overflow-hidden">

      {/* Modals / Overlays */}
      {showWelcomeModal && <WelcomeModal userName={displayUser.name} onClose={handleCloseWelcome} />}

      {showAppSettings && (
        <ApplicationSettingsModal
          isOpen={showAppSettings}
          settings={userSettings}
          pollyVoices={APP_VOICES.map(v => ({ id: v.id, name: v.displayName }))}
          isDesktop={isDesktop}
          onClose={() => setShowAppSettings(false)}
          onSave={async (newSettings) => { await updateUserSettings(newSettings); setShowAppSettings(false); }}
        />
      )}

      {showAccountSettings && (
        <AccountSettingsPage onNavigateBack={() => setShowAccountSettings(false)} isDesktop={isDesktop} />
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
        userSettings={userSettings}
        currentLanguageCode={currentLanguageCode}
        onLanguageChange={(code) => { void updateUserLanguage(code); }}
        onSettingChange={handleSettingChange}
      />

      {/* Top Navigation */}
      <Header
        displayUser={displayUser}
        userSettings={userSettings}
        onOpenAppSettings={() => setShowAppSettings(true)}
        onOpenAccountSettings={() => setShowAccountSettings(true)}
        onSignOut={logout}
        onToggleMobileMenu={() => setShowMobileMenu(true)}
        onSettingChange={handleSettingChange}
        currentLanguageCode={currentLanguageCode}
        onLanguageChange={(code) => { void updateUserLanguage(code); }}
      />

      {/* Three-column workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* LEFT PANEL */}
        <LeftPanel
          isCollapsed={leftCollapsed}
          onToggleCollapse={() => setLeftCollapsed(p => !p)}
          liveStats={manager.liveStats}
          conversationLength={manager.conversationHistory.length}
          userId={user?.id}
          isGeneratingProgressReport={manager.isGeneratingProgressReport}
        />

        {/* CENTER PANEL */}
        <CenterPanel
          conversationHistory={manager.conversationHistory}
          displayUser={displayUser}
          interimTranscript={manager.interimTranscript}
          appStatus={manager.appStatus}
          isSessionActive={manager.isSessionActive}
          sessionTime={manager.sessionTime}
          errorMessage={manager.errorMessage}
          hasMoreHistory={manager.hasMoreHistory}
          onSendMessage={manager.sendTextMessage}
          onStartSession={manager.startSession}
          onEndSession={manager.endSession}
          onLoadOlder={manager.loadOlderMessages}
          onClearError={manager.clearError}
          onToggleFocus={toggleFocusMode}
          isFocusMode={isFocusMode}
        />

        {/* RIGHT PANEL */}
        <RightPanel
          isCollapsed={rightCollapsed}
          onToggleCollapse={() => setRightCollapsed(p => !p)}
          simulationMode={simulationMode}
          onSimulationModeChange={setSimulationMode}
          onClearSession={manager.clearConversation}
          onDownloadTranscript={manager.downloadTranscript}
          conversationLength={manager.conversationHistory.length}
          appStatus={manager.appStatus}
        />
      </div>

      <Footer />
    </div>
  );
}

function AppContent() {
  const { session, loading, initializationError, retryInitialization } = useAuth();
  const { t } = useTranslation();
  const accessToken = session?.access_token;

  const apiClientInstance = useMemo(() => {
    if (!accessToken) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dynamicGatewayUrl = (amplifyOutputs as any)?.custom?.apiBaseUrl;
      return new ApiClient(accessToken, dynamicGatewayUrl);
    } catch (error) {
      logger.error('Client layer initialization crash exception', undefined, { error: String(error) });
      return null;
    }
  }, [accessToken]);

  if (loading) {
    return (
      <div className="h-dvh w-full bg-deep-navy flex flex-col items-center justify-center text-star-white p-6" role="alert" aria-busy="true">
        <div className="w-10 h-10 border-4 border-art-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-base font-bold tracking-wide">{t('app.loading')}</h2>
      </div>
    );
  }

  if (initializationError) {
    return (
      <div className="h-dvh w-full bg-immigo-gray-50 flex items-center justify-center p-6" role="alert">
        <div className="w-full max-w-md rounded-xl border border-immigo-gray-200 bg-star-white p-8 text-center shadow-md">
          <h2 className="text-xl font-bold text-deep-navy">{t('app.authUnavailable')}</h2>
          <p className="mt-3 text-sm text-immigo-gray-600">{initializationError}</p>
          <button
            type="button"
            onClick={retryInitialization}
            className="mt-6 rounded-lg bg-art-blue-600 px-4 py-2 font-semibold text-star-white hover:bg-art-blue-700 focus:outline-none focus:ring-2 focus:ring-art-blue-500"
          >
            {t('app.tryAgain')}
          </button>
        </div>
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
      <I18nProvider>
        <AppContent />
      </I18nProvider>
    </AuthProvider>
  );
}
