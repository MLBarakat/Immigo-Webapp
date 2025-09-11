import React from 'react';
import { MessageSquare } from 'lucide-react';
import { ConversationProvider, useConversation } from './context/ConversationContext';
import { useAuth } from './context/AuthContext'; // Import useAuth
import { useConversationManager } from './hooks/useConversationManager';
import { StatusIndicator } from './components/StatusIndicator';
import { ConversationHistory } from './components/ConversationHistory';
import { ControlPanel } from './components/ControlPanel';
import { ChatInput } from './components/ChatInput';
import { LoginButton } from './components/LoginButton';
import { UserProfile } from './components/UserProfile';
import ImmigoLogo from './assets/immigo_logo.png';

const pollyVoices = [
  // ... voice list remains the same
];

function ConversationApp() {
  const { state, dispatch } = useConversation();
  const { user, login, logout } = useAuth(); // Use real auth state and functions
  const { startSession, endSession, sendTextMessage } = useConversationManager();

  const handleClearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const handleVoiceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch({ type: 'SET_VOICE', payload: event.target.value });
  };

  const isInputDisabled = state.appStatus !== 'idle' && state.appStatus !== 'error';

  return (
    <div className="h-screen ...">
      {/* Header */}
      <header className="bg-star-white ...">
        <div className="flex ...">
          {/* ... Immigo Logo and Title ... */}

          <div className="flex items-center space-x-4">
            {/* ... Voice Selection Dropdown ... */}

            {/* Conditional Login/Logout UI using real auth state */}
            <div>
              {user ? (
                <UserProfile user={{ name: user.email || 'User', initials: user.email?.substring(0, 2).toUpperCase() || 'U' }} onLogout={logout} />
              ) : (
                <LoginButton onLogin={login} />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 ...">
        {/* ... The rest of the component remains the same ... */}
      </div>

      {/* Footer */}
      <footer className="bg-deep-navy ...">
        {/* ... */}
      </footer>
    </div>
  );
}

function App() {
  return (
    <ConversationProvider>
      <ConversationApp />
    </ConversationProvider>
  );
}

export default App;