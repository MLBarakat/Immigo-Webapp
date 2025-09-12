import { useCallback, useRef } from 'react';
import { useConversation } from '../context/ConversationContext';
import { useAuth } from '../context/AuthContext';
import { ApiClient } from '../services/apiClient';
import { SpeechRecognitionManager, AudioManager } from '../utils/audioUtils';
import { v4 as uuidv4 } from 'uuid';

export const useConversationManager = () => {
const { state, dispatch } = useConversation();
const { session } = useAuth();

const recognitionManagerRef = useRef(new SpeechRecognitionManager());
const audioManagerRef = useRef(new AudioManager());

const processAndRespond = useCallback(async (message: string) => {
if (!session) return;
    dispatch({ type: 'START_PROCESSING' });

    try {
      const apiClient = new ApiClient(session.access_token);
      const response = await apiClient.sendMessage(message, state.conversationHistory, state.voiceId);

      const assistantMessage = {
        id: uuidv4(),
        role: 'assistant' as const,
        content: response.responseText,
        timestamp: new Date(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });

      const audio = await audioManagerRef.current.playAudioFromBase64(response.responseAudio);
      dispatch({ type: 'START_SPEAKING', payload: audio });

      audio.onended = () => {
        dispatch({ type: 'STOP_SPEAKING' });
        if (state.isSessionActive) {
          startSession();
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      dispatch({ type: 'SET_ERROR', payload: `Failed to get response: ${errorMessage}` });
    }
  }, [state.conversationHistory, state.isSessionActive, state.voiceId, session, dispatch]);

  const startSession = useCallback(() => {
    dispatch({ type: 'START_LISTENING' });
    recognitionManagerRef.current.startListening(
      (transcript, isFinal) => {
        if (isFinal && transcript.trim()) {
          const userMessage = { id: uuidv4(), role: 'user' as const, content: transcript, timestamp: new Date() };
          dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
          recognitionManagerRef.current.stopListening();
          processAndRespond(transcript);
        }
      },
      (error) => {
        dispatch({ type: 'SET_ERROR', payload: error });
      },
      () => { // onEnd callback
        if (state.isSessionActive) {
          startSession();
        }
      }
    );
  }, [dispatch, processAndRespond, state.isSessionActive]);

  const endSession = useCallback(() => {
    recognitionManagerRef.current.stopListening();
    dispatch({ type: 'END_SESSION' });
  }, [dispatch]);

  const sendTextMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;
    const userMessage = {
      id: uuidv4(),
      role: 'user' as const,
      content: message,
      timestamp: new Date(),
    };
    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
    await processAndRespond(message);
  }, [dispatch, processAndRespond]);

  return { startSession, endSession, sendTextMessage };
};