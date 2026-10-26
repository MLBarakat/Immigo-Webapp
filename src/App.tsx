import { useState, useMemo, useEffect, useRef } from 'react';
import { BookOpen, MessageSquare, SlidersHorizontal } from 'lucide-react';
import { Amplify } from 'aws-amplify';
import { useTranslation } from 'react-i18next';
import amplifyOutputs from '../amplify_outputs.json';

import { TranscriptionProvider } from './context/TranscriptionContext';
import { ConversationProvider } from './context/ConversationContext';
import { useConversation } from './hooks/useConversation';
import { ApiClient } from './services/apiClient';
import { MockExamService, InProgressMockExam } from './services/mockExamService';

import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { AuthPage } from './components/AuthPage';

import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { WelcomeModal } from './components/WelcomeModal';
import { ApplicationSettingsModal } from './components/ApplicationSettingsModal';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { MobileMenuOverlay } from './components/MobileMenuOverlay';
import { SubscriptionModal } from './components/SubscriptionModal';
import { HelpSupportModal } from './components/HelpSupportModal';
import { InviteFriendsModal } from './components/InviteFriendsModal';
import { NotificationsPanel } from './components/NotificationsPanel';
import { LeftPanel } from './components/LeftPanel';
import { CenterPanel } from './components/CenterPanel';
import { RightPanel } from './components/RightPanel';
import type { SimulationMode, TestVersion } from './context/conversationContextTypes';

import { DisplayUser } from './types/user';
import { UserSettings, FontSize, ThemeOption } from './types/settings';
import { applyFontSize } from './utils/fontSize';
import { applyTheme } from './utils/theme';
import { MIC_CONSENT_VERSION } from './utils/micConsent';
import { logger } from './logger';
import useMediaQuery from './hooks/useMediaQuery';
import { useNotifications } from './hooks/useNotifications';
import { setPreferredInputDeviceId, setPreferredOutputDeviceId } from './utils/audioUtils';
import { analytics } from './analytics';
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
  const { t: tCommon } = useTranslation('common');
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('standard');
  const [examToResume, setExamToResume] = useState<InProgressMockExam | null>(null);
  const [pendingExamStartText, setPendingExamStartText] = useState<string | null>(null);
  const [isCheckingExam, setIsCheckingExam] = useState(false);
  const [testVersion, setTestVersion] = useState<TestVersion>(() => {
    try { return localStorage.getItem('immigo_test_version') === '2008' ? '2008' : '2020'; }
    catch { return '2020'; }
  });
  const [includeEnglishSimulation, setIncludeEnglishSimulation] = useState(() => {
    try { return localStorage.getItem('immigo_include_english_simulation') === 'true'; }
    catch { return false; }
  });
  const currentLanguageCode = normalizeAppLanguage(userSettings.language || profile?.language);
  const [previewTheme, setPreviewTheme] = useState<ThemeOption | null>(null);
  const [micAccessError, setMicAccessError] = useState<string | null>(null);

  useEffect(() => {
    const activeTheme = previewTheme ?? userSettings.theme;
    applyTheme(activeTheme);
  }, [previewTheme, userSettings.theme]);

  // Model preload runs on mount (background, no mic). Microphone is
  // requested lazily inside the Start-tap gesture via vad.start().
  // No pre-gesture getUserMedia here: on iOS a background permission
  // prompt backgrounds the tab and triggers visibilitychange churn.

  const activeVoiceId = normalizeVoiceId(
    userSettings.ai_voice_id ?? getDefaultVoiceId(userSettings.language || profile?.language)
  );
  const manager = useConversation({
    apiClient: apiClientInstance,
    userId: user?.id ?? null,
    voiceId: activeVoiceId,
    simulationMode,
    testVersion,
    includeEnglishSimulation,
    preferredLanguage: currentLanguageCode,
    bargeIn: userSettings.barge_in,
  });
  useEffect(() => {
    try {
      localStorage.setItem('immigo_test_version', testVersion);
      localStorage.setItem('immigo_include_english_simulation', String(includeEnglishSimulation));
    } catch { /* preferences remain available for the current app lifetime */ }
  }, [testVersion, includeEnglishSimulation]);
  useEffect(() => {
    if (!manager.dailySessionSettings) return;
    const settings = manager.dailySessionSettings;
    void Promise.resolve().then(() => {
      setSimulationMode(settings.mode);
      setTestVersion(settings.testVersion);
      setIncludeEnglishSimulation(settings.includeEnglishSimulation);
    });
  }, [manager.dailySessionSettings]);
  const managerInitError = (manager as { initError?: string | null }).initError ?? null;

  const requestSessionStart = async () => {
    if (simulationMode !== 'standard' || !user?.id) {
      manager.setMockExamAction('new');
      manager.startSession();
      return;
    }
    setIsCheckingExam(true);
    const unfinishedExam = await MockExamService.getLatestInProgress(user.id, testVersion);
    setIsCheckingExam(false);
    if (unfinishedExam) {
      setExamToResume(unfinishedExam);
      return;
    }
    manager.setMockExamAction('new');
    manager.startSession();
  };

  const chooseExamAction = (action: 'new' | 'resume') => {
    setExamToResume(null);
    manager.setMockExamAction(action);
    if (pendingExamStartText !== null) {
      const text = pendingExamStartText;
      setPendingExamStartText(null);
      void manager.sendTextMessage(text);
    } else {
      manager.startSession();
    }
  };

  const handleSendTextMessage = async (text: string) => {
    if (simulationMode === 'standard' && user?.id && !manager.currentItemId) {
      setPendingExamStartText(text);
      setIsCheckingExam(true);
      const unfinishedExam = await MockExamService.getLatestInProgress(user.id, testVersion);
      setIsCheckingExam(false);
      if (unfinishedExam) {
        setExamToResume(unfinishedExam);
        return;
      }
      setPendingExamStartText(null);
      manager.setMockExamAction('new');
    }
    void manager.sendTextMessage(text);
  };

  const handleSimulationModeChange = (mode: SimulationMode) => {
    if (mode === simulationMode) return;
    setSimulationMode(mode);
    if (manager.sessionId && user?.id) void manager.changeMode(mode);
  };

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
  const [showSubscription, setShowSubscription] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showHelpSupport, setShowHelpSupport] = useState(false);
  const [showInviteFriends, setShowInviteFriends] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const {
    notifications,
    unreadCount,
    addNotification,
    markRead,
    markAllRead,
    clearAll,
  } = useNotifications({
    userId: user?.id ?? null,
    settings: userSettings,
  });

  // Persisted device choices are applied before the next session starts. The
  // VAD helper reads this module-level preference when it opens the mic, and
  // the shared Polly element re-routes on creation/update.
  useEffect(() => {
    setPreferredInputDeviceId(userSettings.input_device_id ?? null);
  }, [userSettings.input_device_id]);

  useEffect(() => {
    setPreferredOutputDeviceId(userSettings.output_device_id ?? null);
  }, [userSettings.output_device_id]);

  const previousSessionActiveRef = useRef(false);
  useEffect(() => {
    const wasActive = previousSessionActiveRef.current;
    previousSessionActiveRef.current = manager.isSessionActive;
    if (!wasActive || manager.isSessionActive) return;
    if (manager.conversationHistory.length === 0) return;
    addNotification({
      type: 'session',
      title: tCommon('notifications.sessionCompleteTitle'),
      body: tCommon('notifications.sessionCompleteBody', { count: manager.conversationHistory.length }),
    });
  }, [addNotification, manager.conversationHistory.length, manager.isSessionActive, tCommon]);

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
      <div className="flex flex-col h-dvh w-full bg-immigo-gray-50 dark:bg-gray-900 text-deep-navy dark:text-gray-100 font-sans antialiased overflow-hidden">
        {showWelcomeModal && <WelcomeModal userName={displayUser.name} onClose={handleCloseWelcome} />}
        {showAppSettings && (
          <ApplicationSettingsModal
            isOpen={showAppSettings}
            settings={userSettings}
            pollyVoices={APP_VOICES.map(v => ({ id: v.id, name: v.displayName }))}
            isDesktop={false}
            isSessionActive={manager.isSessionActive || manager.isVoiceSessionActive}
            onClose={() => { setPreviewTheme(null); setShowAppSettings(false); }}
            onThemePreview={setPreviewTheme}
            onSave={async (newSettings) => { await updateUserSettings(newSettings); }}
          />
        )}
        {showAccountSettings && (
          <AccountSettingsPage onNavigateBack={() => setShowAccountSettings(false)} isDesktop={false} />
        )}
        {showSubscription && <SubscriptionModal isOpen={showSubscription} onClose={() => setShowSubscription(false)} />}
        {showHelpSupport && <HelpSupportModal isOpen={showHelpSupport} onClose={() => setShowHelpSupport(false)} />}
        {showInviteFriends && <InviteFriendsModal isOpen={showInviteFriends} onClose={() => setShowInviteFriends(false)} />}
        {showNotifications && (
          <NotificationsPanel
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            onClearAll={clearAll}
            settings={userSettings}
            onSettingChange={handleSettingChange}
          />
        )}
        <MobileMenuOverlay
          isOpen={showMobileMenu}
          onClose={() => setShowMobileMenu(false)}
          onOpenAppSettings={() => { setShowMobileMenu(false); setShowAppSettings(true); }}
          onOpenAccountSettings={() => { setShowMobileMenu(false); setShowAccountSettings(true); }}
          onManageSubscription={() => { setShowMobileMenu(false); setShowSubscription(true); }}
          onOpenHelpSupport={() => { setShowMobileMenu(false); setShowHelpSupport(true); }}
          onOpenInviteFriends={() => { setShowMobileMenu(false); setShowInviteFriends(true); }}
          onSignOut={logout}
          user={displayUser}
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
          notificationCount={unreadCount}
          onOpenNotifications={() => setShowNotifications(true)}
        />
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
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
              isModelLoading={manager.isModelLoading}
              isVadReady={manager.isVadReady}
              isSessionActive={manager.isSessionActive}
              isVoiceSessionActive={manager.isVoiceSessionActive}
              errorMessage={manager.errorMessage}
              hasMoreHistory={manager.hasMoreHistory}
              onSendMessage={handleSendTextMessage}
              onStartSession={requestSessionStart}
              onEndSession={manager.endSession}
              micConsentVersion={userSettings.mic_consent_version}
              onMicConsent={async () => { await updateUserSettings({ mic_consent_version: MIC_CONSENT_VERSION }); }}
              micAccessError={manager.micError ?? micAccessError}
              onClearMicAccessError={() => { setMicAccessError(null); manager.clearMicError(); }}
              initError={managerInitError}
              isAudioRetryPending={manager.isAudioRetryPending}
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
              onSimulationModeChange={handleSimulationModeChange}
              testVersion={testVersion}
              onTestVersionChange={setTestVersion}
              includeEnglishSimulation={includeEnglishSimulation}
              onIncludeEnglishSimulationChange={setIncludeEnglishSimulation}
              userId={user?.id}
              currentItemId={manager.currentItemId}
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
            className={`flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap px-0.5 py-2 text-xs font-semibold leading-none min-[360px]:gap-1.5 min-[360px]:text-[0.8125rem] sm:text-sm ${mobileWorkspace === 'resources' ? 'text-art-blue-700 bg-art-blue-50' : 'text-immigo-gray-600'}`}
          >
            <BookOpen className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
            <span className="min-w-0 truncate">{tConversation('workspace.mobile.resources')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileWorkspace('interview')}
            aria-current={mobileWorkspace === 'interview' ? 'page' : undefined}
            className={`flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap px-0.5 py-2 text-xs font-semibold leading-none min-[360px]:gap-1.5 min-[360px]:text-[0.8125rem] sm:text-sm ${mobileWorkspace === 'interview' ? 'text-art-blue-700 bg-art-blue-50' : 'text-immigo-gray-600'}`}
          >
            <MessageSquare className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
            <span className="min-w-0 truncate">{tConversation('workspace.mobile.interview')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileWorkspace('controls')}
            aria-current={mobileWorkspace === 'controls' ? 'page' : undefined}
            className={`flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap px-0.5 py-2 text-xs font-semibold leading-none min-[360px]:gap-1.5 min-[360px]:text-[0.8125rem] sm:text-sm ${mobileWorkspace === 'controls' ? 'text-art-blue-700 bg-art-blue-50' : 'text-immigo-gray-600'}`}
          >
            <SlidersHorizontal className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
            <span className="min-w-0 truncate">{tConversation('workspace.mobile.controls')}</span>
          </button>
        </nav>
        <Footer />
      </div>
    );
  }

  // ── Desktop three-panel layout ──
  return (
    <div className="flex flex-col h-dvh w-full bg-immigo-gray-50 dark:bg-gray-900 text-deep-navy dark:text-gray-100 font-sans antialiased overflow-hidden">

      {/* Modals / Overlays */}
      {showWelcomeModal && <WelcomeModal userName={displayUser.name} onClose={handleCloseWelcome} />}

      {showAppSettings && (
        <ApplicationSettingsModal
          isOpen={showAppSettings}
          settings={userSettings}
          pollyVoices={APP_VOICES.map(v => ({ id: v.id, name: v.displayName }))}
          isDesktop={isDesktop}
          isSessionActive={manager.isSessionActive || manager.isVoiceSessionActive}
          onClose={() => { setPreviewTheme(null); setShowAppSettings(false); }}
          onThemePreview={setPreviewTheme}
          onSave={async (newSettings) => { await updateUserSettings(newSettings); }}
        />
      )}

      {showAccountSettings && (
        <AccountSettingsPage onNavigateBack={() => setShowAccountSettings(false)} isDesktop={isDesktop} />
      )}

      {showSubscription && <SubscriptionModal isOpen={showSubscription} onClose={() => setShowSubscription(false)} />}

      {showHelpSupport && <HelpSupportModal isOpen={showHelpSupport} onClose={() => setShowHelpSupport(false)} />}
      {showInviteFriends && <InviteFriendsModal isOpen={showInviteFriends} onClose={() => setShowInviteFriends(false)} />}
      {showNotifications && (
        <NotificationsPanel
          isOpen={showNotifications}
          onClose={() => setShowNotifications(false)}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
          onClearAll={clearAll}
          settings={userSettings}
          onSettingChange={handleSettingChange}
        />
      )}

      <MobileMenuOverlay
        isOpen={showMobileMenu}
        onClose={() => setShowMobileMenu(false)}
        onOpenAppSettings={() => { setShowMobileMenu(false); setShowAppSettings(true); }}
        onOpenAccountSettings={() => { setShowMobileMenu(false); setShowAccountSettings(true); }}
        onManageSubscription={() => { setShowMobileMenu(false); setShowSubscription(true); }}
        onOpenHelpSupport={() => { setShowMobileMenu(false); setShowHelpSupport(true); }}
        onOpenInviteFriends={() => { setShowMobileMenu(false); setShowInviteFriends(true); }}
        onSignOut={logout}
        user={displayUser}
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
        notificationCount={unreadCount}
        onOpenNotifications={() => setShowNotifications(true)}
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
          isModelLoading={manager.isModelLoading}
          isVadReady={manager.isVadReady}
          isSessionActive={manager.isSessionActive}
          isVoiceSessionActive={manager.isVoiceSessionActive}
          errorMessage={manager.errorMessage}
          hasMoreHistory={manager.hasMoreHistory}
          onSendMessage={handleSendTextMessage}
          onStartSession={requestSessionStart}
          onEndSession={manager.endSession}
          micConsentVersion={userSettings.mic_consent_version}
          onMicConsent={async () => { await updateUserSettings({ mic_consent_version: MIC_CONSENT_VERSION }); }}
          micAccessError={manager.micError ?? micAccessError}
          onClearMicAccessError={() => { setMicAccessError(null); manager.clearMicError(); }}
          initError={managerInitError}
          isAudioRetryPending={manager.isAudioRetryPending}
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
          onSimulationModeChange={handleSimulationModeChange}
          testVersion={testVersion}
          onTestVersionChange={setTestVersion}
          includeEnglishSimulation={includeEnglishSimulation}
          onIncludeEnglishSimulationChange={setIncludeEnglishSimulation}
          userId={user?.id}
          currentItemId={manager.currentItemId}
          onClearSession={manager.clearConversation}
          onDownloadTranscript={manager.downloadTranscript}
          conversationLength={manager.conversationHistory.length}
          appStatus={manager.appStatus}
        />
      </div>

      <Footer />

      {(examToResume || isCheckingExam) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="mock-exam-choice-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-800">
            <h2 id="mock-exam-choice-title" className="text-lg font-bold text-deep-navy dark:text-white">
              {isCheckingExam ? 'Checking your exam…' : 'Continue your mock exam?'}
            </h2>
            {isCheckingExam ? (
              <p className="mt-2 text-sm text-immigo-gray-600 dark:text-gray-300">Looking for an unfinished exam in this question bank.</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-immigo-gray-600 dark:text-gray-300">
                  {examToResume?.english_stage === 'reading' || examToResume?.english_stage === 'writing'
                    ? `Your previous ${examToResume.test_version} exam has finished the civics section and is ready to continue with English ${examToResume.english_stage} practice.`
                    : `Your previous ${examToResume?.test_version} exam has ${Math.max(0, examToResume?.question_ids.length ?? 0) - (examToResume?.current_index ?? 0)} civics questions remaining. You can continue it or begin a new exam.`}
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => chooseExamAction('resume')} className="rounded-lg bg-art-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-art-blue-700">Continue exam</button>
                  <button type="button" onClick={() => chooseExamAction('new')} className="rounded-lg border border-immigo-gray-300 px-4 py-2 text-sm font-semibold text-deep-navy hover:bg-immigo-gray-50 dark:text-white">Start a new exam</button>
                  <button type="button" onClick={() => { setExamToResume(null); setPendingExamStartText(null); }} className="rounded-lg px-4 py-2 text-sm text-immigo-gray-600 hover:bg-immigo-gray-100 dark:text-gray-300">Cancel</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {manager.examCompletion && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="mock-exam-complete-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-800">
            <h2 id="mock-exam-complete-title" className="text-lg font-bold text-deep-navy dark:text-white">Mock exam complete</h2>
            <p className="mt-3 whitespace-pre-line text-sm text-immigo-gray-700 dark:text-gray-200">{manager.examCompletion.report}</p>
            <p className="mt-3 text-sm text-immigo-gray-700 dark:text-gray-200">Based on this result, {manager.examCompletion.recommendedMode === 'study' ? 'Study Mode' : 'Practice Mode'} may help you most next.</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { manager.dismissExamCompletion(); manager.setMockExamAction('new'); manager.startSession(); }} className="rounded-lg border border-immigo-gray-300 px-4 py-2 text-sm font-semibold text-deep-navy hover:bg-immigo-gray-50 dark:text-white">Start a new mock exam</button>
              <button type="button" onClick={() => { const mode = manager.examCompletion!.recommendedMode; manager.dismissExamCompletion(); handleSimulationModeChange(mode); }} className="rounded-lg bg-art-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-art-blue-700">Switch modes and continue</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function AppContent() {
  const {
    session,
    loading,
    initializationError,
    retryInitialization,
    sessionReplacementPending,
    sessionReplacementError,
    logoutReplacedSession,
  } = useAuth();
  const { t } = useTranslation();
  const accessToken = session?.access_token;

  // Capture invite attribution before authentication so the value survives the
  // sign-up round trip. The code is stored in user_metadata by signUp().
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const referral = url.searchParams.get('ref');
      if (!referral) return;
      const cleanReferral = referral.trim().slice(0, 32);
      if (cleanReferral) {
        window.localStorage.setItem('immigo_referral_code', cleanReferral);
        analytics.track('referral_visit', { code: cleanReferral });
      }
      url.searchParams.delete('ref');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Attribution is best-effort; never block app start.
    }
  }, []);

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

  // Transition-only diagnostic: names the mount boundary that re-creates the
  // workspace. Prime suspect for the 2026-10-21 post-resume transcription
  // death: a momentary session null (or loading flash) on foregrounding
  // swapping this tree to AuthPage/loading unmounted TranscriptionProvider
  // while the module-shared VAD kept the dead instance's callbacks.
  const appBranchRef = useRef<string | null>(null);
  useEffect(() => {
    let branch: string;
    if (sessionReplacementPending) branch = 'session-replaced';
    else if (loading) branch = 'loading';
    else if (initializationError) branch = 'initialization-error';
    else if (session) branch = 'workspace';
    else branch = 'auth-page';
    const previous = appBranchRef.current;
    if (previous !== null && previous !== branch) {
      logger.info('[APP-BRANCH] Workspace mount boundary crossed.', { from: previous, to: branch });
    }
    appBranchRef.current = branch;
  }, [sessionReplacementPending, loading, initializationError, session]);

  if (sessionReplacementPending) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="session-replaced-title">
        <div className="w-full max-w-md rounded-2xl bg-star-white p-6 shadow-2xl dark:bg-gray-800">
          <h2 id="session-replaced-title" className="text-lg font-bold text-deep-navy dark:text-gray-100">
            {t('auth.sessionReplaced.title')}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-immigo-gray-700 dark:text-gray-300">
            {t('auth.sessionReplaced.message')}
          </p>
          {sessionReplacementError && (
            <p className="mt-3 text-sm text-art-red-600" role="alert">{sessionReplacementError}</p>
          )}
          <button
            type="button"
            onClick={() => { void logoutReplacedSession().catch(() => undefined); }}
            className="mt-5 rounded-lg bg-art-blue-600 px-4 py-2 text-sm font-semibold text-star-white hover:bg-art-blue-700 focus:outline-none focus:ring-2 focus:ring-art-blue-500 focus:ring-offset-2"
          >
            {t('auth.sessionReplaced.action')}
          </button>
        </div>
      </div>
    );
  }

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
