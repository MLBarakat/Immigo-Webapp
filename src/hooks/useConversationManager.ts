import { useContext, useCallback, useRef, useEffect } from 'react'; // Added useEffect
import { useConversation } from '../context/ConversationContext';
import { ApiClient } from '../services/apiClient';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '../types/conversation'; // Import Message type

// Placeholder for useSpeechRecognition and useSpeechSynthesis, assuming they are available or mocked
// import { useSpeechRecognition } from './useSpeechRecognition';
// import { useSpeechSynthesis } from './useSpeechSynthesis';

interface UseConversationManagerProps {
apiClient: ApiClient | null;
}

export const useConversationManager = ({ apiClient }: UseConversationManagerProps) => {
const { state, dispatch } = useConversation();
const currentConversationId = useRef<string>(uuidv4());
const intervalRef = useRef<number | null>(null);

// Placeholder for audio output - replace with actual speech synthesis integration
const speakText = useCallback((text: string) => {
console.log("AI would speak:", text);
    // Actual speech synthesis logic would go here
  }, []);

  const handleTextChunk = useCallback((textChunk: string) => {
    // Logic to update the UI with AI's partial text response
    console.log("Received AI text chunk:", textChunk);
    dispatch({ type: 'UPDATE_MESSAGE', payload: { id: 'ai-temp-message', text: textChunk } }); // Assuming a temporary ID for streaming
  }, [dispatch]);

  const handleAudioChunk = useCallback((audioChunk: Uint8Array) => {
    // Logic to play the audio chunk
    console.log("Received AI audio chunk:", audioChunk);
    // This would typically involve an AudioContext and playing buffers
  }, []);

  // Timer for session duration
  useEffect(() => {
    if (state.isSessionActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        dispatch({ type: 'UPDATE_SESSION_TIME', payload: state.sessionTime + 1 });
      }, 1000) as unknown as number; // Type assertion for setInterval return
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.isSessionActive, state.sessionTime, dispatch]);


  const startSession = useCallback(async () => {
    if (!apiClient) {
      dispatch({ type: 'SET_ERROR_MESSAGE', payload: 'API Client not available.' });
      return;
    }
    dispatch({ type: 'START_SESSION' });
    currentConversationId.current = uuidv4(); // Generate new ID for new session
    console.log("Session started. Conversation ID:", currentConversationId.current);

    // Potentially send a "session start" message to backend if required
  }, [apiClient, dispatch]);

  const endSession = useCallback(() => {
    dispatch({ type: 'END_SESSION' });
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    console.log("Session ended.");
    // Potentially send a "session end" message to backend
  }, [dispatch]);


  const sendUserMessage = useCallback(async (text: string) => {
    if (!apiClient) {
      dispatch({ type: 'SET_ERROR_MESSAGE', payload: 'API Client not available.' });
      return;
    }

    dispatch({ type: 'START_PROCESSING' });

    const userMessage: Message = {
      id: uuidv4(),
      type: 'user',
      text: text,
      timestamp: new Date().toISOString(), // Corrected Date to string conversion
    };
    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

    try {
      await apiClient.sendMessage(
        currentConversationId.current,
        text,
        state.aiVoiceId, // Corrected from voiceId
        state.currentLanguageCode,
        state.micMode,
        state.bargeIn,
        state.liveFeedbackEnabled,
        handleTextChunk, // Callback for text stream
        handleAudioChunk // Callback for audio stream
      );
      // No explicit AI message addition here, as streaming callbacks will handle it
      dispatch({ type: 'STOP_SPEAKING' }); // Assume stopping speaking and listening again
    } catch (error: any) {
      console.error('Error sending message:', error);
      dispatch({ type: 'SET_ERROR_MESSAGE', payload: error.message || 'Failed to send message.' });
      dispatch({ type: 'STOP_SPEAKING' }); // Ensure status resets even on error
    }
  }, [apiClient, dispatch, state.aiVoiceId, state.currentLanguageCode, state.micMode, state.bargeIn, state.liveFeedbackEnabled, handleTextChunk, handleAudioChunk]);


  const clearConversation = useCallback(async () => {
    dispatch({ type: 'CLEAR_CONVERSATION' });
    console.log("Conversation cleared.");
    // Potentially clear history on backend as well
  }, [dispatch]);

  const downloadTranscript = useCallback(() => {
    const transcript = state.conversationHistory.map(msg => `${msg.type.toUpperCase()}: ${msg.text}`).join('\n');
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `immigo_transcript_${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [state.conversationHistory]);

  return {
    startSession,
    endSession,
    sendUserMessage,
    clearConversation,
    downloadTranscript,
    conversationHistory: state.conversationHistory,
    appStatus: state.appStatus,
    isSessionActive: state.isSessionActive,
    sessionTime: state.sessionTime,
    errorMessage: state.errorMessage,
    currentLanguageCode: state.currentLanguageCode,
    aiVoiceId: state.aiVoiceId,
    liveFeedbackEnabled: state.liveFeedbackEnabled,
    micMode: state.micMode,
    bargeIn: state.bargeIn,
  };
};