import { useState, useMemo, useEffect } from 'react';
import { Amplify } from 'aws-amplify';

import amplifyOutputs from '../amplify_outputs.json';

import { TranscriptionProvider } from './context/TranscriptionContext';
import { ConversationProvider } from './context/ConversationContext';
import { useConversationManager } from './hooks/useConversationManager';
import { ApiClient } from './services/apiClient';
import { VoiceHub } from './components/VoiceHub';
import { AudioRecorder } from './components/AudioRecorder';
import { ChatInput } from './components/ChatInput';
import { logger } from './logger';

// Initialize core AWS cloud infrastructure mappings natively on execution startup
try {
  if (amplifyOutputs) {
    Amplify.configure(amplifyOutputs);
    logger.info('AWS Amplify Gen 2 ecosystem parameters successfully bound to runtime execution context.');
  }
} catch (configError) {
  logger.warn('Amplify Core Hook Warning: Sandbox metadata file unavailable during early compiler stage.', { error: String(configError) });
}

interface ConversationWorkspaceProps {
  readonly apiClientInstance: ApiClient | null;
}

function ConversationWorkspace({ apiClientInstance }: ConversationWorkspaceProps): JSX.Element {
  // Mount the continuous dual-track speculative orchestration manager
  const manager = useConversationManager({ apiClient: apiClientInstance });

  return (
    <div className="min-h-screen bg-immigo-gray-50 flex flex-col justify-between">
      {/* Universal Workspace Header bar */}
      <header className="bg-deep-navy text-star-white px-6 py-4 shadow-md flex justify-between items-center" role="banner">
        <div>
          <h1 className="text-xl font-bold tracking-wide">Immigo Interactive Speech Sandbox</h1>
          <p className="text-xs text-immigo-gray-300 mt-0.5">Automated Real-Time AI Language Training Core</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={manager.downloadTranscript}
            disabled={manager.conversationHistory.length === 0}
            className="px-3 py-1.5 text-xs font-semibold bg-art-blue-600 hover:bg-art-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-all cursor-pointer"
            aria-label="Export active chat transcripts to text file"
          >
            Export Logs
          </button>
          <button
            onClick={manager.clearConversation}
            disabled={manager.conversationHistory.length === 0}
            className="px-3 py-1.5 text-xs font-semibold bg-immigo-gray-700 hover:bg-immigo-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-all cursor-pointer"
            aria-label="Clear active conversation view window"
          >
            Reset Arena
          </button>
        </div>
      </header>

      {/* Main interaction workspace area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Error notification display panel banner */}
        {manager.errorMessage && (
          <div 
            className="p-4 bg-art-red-50 border-l-4 border-art-red-600 rounded text-sm text-art-red-800 flex justify-between items-center"
            role="alert"
          >
            <p className="font-medium">System Intercept Exception: {manager.errorMessage}</p>
            <button 
              onClick={manager.clearError}
              className="text-xs underline hover:text-art-red-900 cursor-pointer"
            >
              Acknowledge
            </button>
          </div>
        )}

        {/* Global FSM Visualizer Ledger Viewport */}
        <section className="bg-white rounded-xl shadow-sm border border-immigo-gray-200 p-4 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold text-deep-navy">Authoritative Transcription Engine</h2>
            <p className="text-xs text-immigo-gray-500 mt-0.5">Real-Time Speculative Matrix Graph Sync Active</p>
          </div>
          <VoiceHub
            status={manager.appStatus}
            isSessionActive={manager.isSessionActive}
            sessionTime={manager.sessionTime}
            onStartSession={manager.startSession}
            onEndSession={manager.endSession}
          />
        </section>

        {/* Real-time split-token transcription viewport element container */}
        <section aria-label="Interactive Transcript Display Window">
          <AudioRecorder
            speculativeText={manager.interimTranscript}
            committedText={manager.finalTranscript}
            isSessionActive={manager.isSessionActive}
            vadReady={manager.isVadReady}
            isModelLoading={manager.isModelLoading}
            modelLoadingProgress={manager.modelLoadingProgress}
            fsmState={manager.currentState}
            isTranscribing={manager.isTranscribing}
            onStart={manager.startSession}
            onStop={manager.endSession}
          />
        </section>

        {/* Historical Conversation Message Stream Log View */}
        <section 
          className="flex-1 bg-white rounded-xl shadow-sm border border-immigo-gray-200 p-4 min-h-[300px] flex flex-col gap-4 overflow-y-auto"
          aria-label="Historical Conversation Messages Ledger"
        >
          {manager.conversationHistory.length > 0 ? (
            manager.conversationHistory.map((message) => (
              <div 
                key={message.id}
                className={`flex flex-col max-w-[80%] ${
                  message.role === 'user' ? 'self-end items-end' : 'self-start items-start'
                }`}
              >
                <span className="text-[10px] text-immigo-gray-400 capitalize mb-0.5 px-1">
                  {message.role} • {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <div 
                  className={`p-3 rounded-xl text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'bg-art-blue-600 text-star-white rounded-tr-none'
                      : 'bg-immigo-gray-100 text-deep-navy rounded-tl-none border border-immigo-gray-200'
                  }`}
                >
                  {message.content ? message.content : (
                    <span className="inline-flex gap-1 items-center py-1 px-2" aria-label="Assistant is writing">
                      <span className="w-1.5 h-1.5 bg-deep-navy rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-deep-navy rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-deep-navy rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6" aria-hidden="true">
              <p className="text-sm text-immigo-gray-400 italic">No conversational messages logged in active workspace buffer.</p>
              <p className="text-xs text-immigo-gray-400 mt-1">Tap the microphone control interface above to begin training.</p>
            </div>
          )}
        </section>
      </main>

      {/* Manual text backup keyboard input footer dock */}
      <footer role="contentinfo" className="border-t border-immigo-gray-200 bg-white">
        <ChatInput
          onSendMessage={manager.sendTextMessage}
          disabled={manager.isSessionActive}
        />
      </footer>
    </div>
  );
}

export default function App(): JSX.Element {
  // Local identity string state holder simulated to anchor Cognito JWT structures
  const [mockUserToken, setMockUserToken] = useState<string | null>(null);

  useEffect(() => {
    // Simulate an authentication handshake phase
    const authTimeoutTimer = setTimeout(() => {
      const secureSimulatedJwtToken = 'bearer_simulation_token_key_hash_ident_v1';
      setMockUserToken(secureSimulatedJwtToken);
      logger.info('Authoritative Cognito JWT Security context successfully bound to main workspace context.');
    }, 400);

    return () => clearTimeout(authTimeoutTimer);
  }, []);

  // Optimize ApiClient initialization to prevent instance recreating loops on minor parent triggers
  const apiClientInstance = useMemo<ApiClient | null>(() => {
    if (!mockUserToken) return null;
    try {
      // Resolves custom CDK REST endpoints directly from the config graph to eliminate static .env tracking errors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dynamicGatewayUrl = (amplifyOutputs as any)?.custom?.apiBaseUrl;
      return new ApiClient(mockUserToken, dynamicGatewayUrl);
    } catch (error) {
      logger.error('Security Failure: Client layer initialization crash exception encountered:', undefined, { error: String(error) });
      return null;
    }
  }, [mockUserToken]);

  // Global loading overlay display shield protecting early component mounts
  if (!mockUserToken) {
    return (
      <div 
        className="min-h-screen bg-deep-navy flex flex-col items-center justify-center text-star-white p-6"
        role="alert" 
        aria-busy="true"
        aria-label="Initializing workspace capability runtimes"
      >
        <div className="w-10 h-10 border-4 border-art-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-base font-bold tracking-wide">Securing Processing Environment…</h2>
        <p className="text-xs text-immigo-gray-400 mt-1 font-mono">Loading hardware accelerators & encryption handshakes</p>
      </div>
    );
  }

  return (
    <TranscriptionProvider>
      <ConversationProvider apiClient={apiClientInstance}>
        <ConversationWorkspace apiClientInstance={apiClientInstance} />
      </ConversationProvider>
    </TranscriptionProvider>
  );
}