import { useCallback, useRef } from 'react';
import { useConversation } from '../context/ConversationContext';
import { ApiClient } from '../services/apiClient';
import { SpeechRecognitionManager, AudioManager } from '../utils/audioUtils';
import { v4 as uuidv4 } from 'uuid';

export const useConversationManager = () => {
  const { state, dispatch } = useConversation();
  const recognitionManagerRef = useRef(new SpeechRecognitionManager());
  const audioManagerRef = useRef(new AudioManager());
  const apiClientRef = useRef(new ApiClient('demo-key')); // Or your actual API key

  const processAndRespond = useCallback(async (message: string) => {
    dispatch({ type: 'START_PROCESSING' });

    try {
      const response = await apiClientRef.current.sendMessage(message, state.conversationHistory);

      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: uuidv4(),
          role: 'assistant',
          content: response.responseText,
          timestamp: new Date(),
        },
      });

      const audio = await audioManagerRef.current.playAudioFromBase64(response.responseAudio);
      dispatch({ type: 'START_SPEAKING', payload: audio });

      audio.onended = () => {
        dispatch({ type: 'STOP_SPEAKING' });
        // Restart listening if the session is still active
        if (state.isSessionActive) {
          startSession();
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      dispatch({ type: 'SET_ERROR', payload: `Failed to get response: ${errorMessage}` });
    }
  }, [state.conversationHistory, state.isSessionActive, dispatch]);

  const startSession = useCallback(() => {
    dispatch({ type: 'START_SESSION' });
    recognitionManagerRef.current.startListening(
      (transcript, isFinal) => {
        if (isFinal) {
          dispatch({
            type: 'ADD_MESSAGE',
            payload: { id: uuidv4(), role: 'user', content: transcript, timestamp: new Date() },
          });
          recognitionManagerRef.current.stopListening();
          processAndRespond(transcript);
        }
      },
      (error) => {
        dispatch({ type: 'SET_ERROR', payload: error });
      },
      () => {
        // onEnd callback
        if (state.isSessionActive) {
          // If session is still active, but recognition stopped (e.g., silence), restart it.
          // This creates the continuous listening loop.
          startSession();
        }
      }
    );
    dispatch({ type: 'START_LISTENING' });
  }, [dispatch, processAndRespond, state.isSessionActive]);

  const endSession = useCallback(() => {
    recognitionManagerRef.current.stopListening();
    dispatch({ type: 'END_SESSION' });
  }, [dispatch]);

  const sendTextMessage = useCallback(async (message: string) => {
    dispatch({
      type: 'ADD_MESSAGE',
      payload: { id: uuidv4(), role: 'user', content: message, timestamp: new Date() },
    });
    await processAndRespond(message);
  }, [dispatch, processAndRespond]);

  return { startSession, endSession, sendTextMessage };
};