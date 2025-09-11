import { useCallback, useEffect, useRef } from 'react';
import { useConversation } from '../context/ConversationContext';
import { AudioManager, SpeechRecognitionManager } from '../utils/audioUtils';
import { ApiClient } from '../services/apiClient';
import { Message } from '../types/conversation';

export function useConversationManager() {
  const { state, dispatch } = useConversation();
  const audioManagerRef = useRef<AudioManager>(new AudioManager());
  const speechRecognitionRef = useRef<SpeechRecognitionManager>(new SpeechRecognitionManager());
  const apiClientRef = useRef<ApiClient>(new ApiClient());
  const currentTranscriptRef = useRef<string>('');
  const finalTranscriptRef = useRef<string>('');

  const handleBargeIn = useCallback(() => {
    console.log('Barge-in detected, stopping current audio and requests');
    
    // Stop current audio
    if (state.currentAudio) {
      state.currentAudio.pause();
      state.currentAudio.currentTime = 0;
    }
    
    // Abort pending requests
    if (state.abortController) {
      state.abortController.abort();
    }
    
    // Clear audio
    audioManagerRef.current.stopAllAudio();
    
    // Update state
    dispatch({ type: 'STOP_SPEAKING' });
    dispatch({ type: 'START_LISTENING' });
  }, [state.currentAudio, state.abortController, dispatch]);

  const processUserInput = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;

    console.log('Processing user input:', transcript);

    // Check for stop command (must be alone)
    const trimmedTranscript = transcript.trim().toLowerCase();
    if (trimmedTranscript === 'stop') {
      console.log('Stop command detected');
      endSession();
      return;
    }

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content: transcript,
      role: 'user',
      timestamp: new Date(),
    };
    
    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
    dispatch({ type: 'START_PROCESSING' });

    try {
      // Create abort controller for this request
      const abortController = new AbortController();
      dispatch({ type: 'SET_ABORT_CONTROLLER', payload: abortController });

      const response = await apiClientRef.current.sendMessage(
        transcript,
        state.conversationHistory,
        abortController.signal
      );

      // Add assistant message
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response.responseText,
        role: 'assistant',
        timestamp: new Date(),
        audioData: response.responseAudio,
      };
      
      dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });

      // Play audio response
      if (response.responseAudio) {
        await audioManagerRef.current.resumeAudioContext();
        const audio = await audioManagerRef.current.playAudioFromBase64(response.responseAudio);
        
        dispatch({ type: 'START_SPEAKING', payload: audio });
        
        audio.onended = () => {
          console.log('Audio playback ended, restarting listening');
          dispatch({ type: 'STOP_SPEAKING' });
          if (state.isSessionActive) {
            startListening();
          }
        };
        
        audio.onerror = (error) => {
          console.error('Audio playback error:', error);
          dispatch({ type: 'SET_ERROR', payload: 'Audio playback failed' });
        };
        
        audio.play().catch(error => {
          console.error('Failed to play audio:', error);
          dispatch({ type: 'SET_ERROR', payload: 'Failed to play audio response' });
        });
      } else {
        // No audio, go back to listening
        dispatch({ type: 'SET_STATUS', payload: 'idle' });
        if (state.isSessionActive) {
          startListening();
        }
      }

      // Clear abort controller
      dispatch({ type: 'SET_ABORT_CONTROLLER', payload: null });

    } catch (error) {
      console.error('Failed to process user input:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process message';
      
      if (errorMessage !== 'Request was cancelled') {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
      
      dispatch({ type: 'SET_ABORT_CONTROLLER', payload: null });
    }
  }, [state.conversationHistory, state.isSessionActive, dispatch]);

  const startListening = useCallback(() => {
    if (state.appStatus === 'processing' || state.appStatus === 'speaking') {
      return;
    }

    console.log('Starting to listen...');
    dispatch({ type: 'START_LISTENING' });
    
    currentTranscriptRef.current = '';
    finalTranscriptRef.current = '';

    speechRecognitionRef.current.startListening(
      (transcript, isFinal) => {
        currentTranscriptRef.current = transcript;
        
        if (isFinal) {
          finalTranscriptRef.current = transcript;
          console.log('Final transcript:', transcript);
          processUserInput(transcript);
        }
      },
      (error) => {
        console.error('Speech recognition error:', error);
        
        if (error === 'not-allowed') {
          dispatch({ type: 'SET_ERROR', payload: 'Microphone access denied. Please grant permission and try again.' });
        } else if (error === 'no-speech') {
          console.log('No speech detected, restarting...');
          if (state.isSessionActive && state.appStatus === 'listening') {
            setTimeout(() => startListening(), 100);
          }
        } else {
          dispatch({ type: 'SET_ERROR', payload: `Speech recognition error: ${error}` });
        }
      },
      () => {
        console.log('Speech recognition ended');
        if (state.isSessionActive && state.appStatus === 'listening' && !finalTranscriptRef.current) {
          setTimeout(() => startListening(), 100);
        }
      }
    );
  }, [state.appStatus, state.isSessionActive, processUserInput, dispatch]);

  const startSession = useCallback(async () => {
    console.log('Starting conversation session');
    
    try {
      // Check if API is available
      const isHealthy = await apiClientRef.current.healthCheck();
      if (!isHealthy) {
        dispatch({ type: 'SET_ERROR', payload: 'Backend service is not available. Please try again later.' });
        return;
      }

      dispatch({ type: 'START_SESSION' });
      await audioManagerRef.current.resumeAudioContext();
      startListening();
    } catch (error) {
      console.error('Failed to start session:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to start conversation session' });
    }
  }, [startListening, dispatch]);

  const endSession = useCallback(() => {
    console.log('Ending conversation session');
    
    speechRecognitionRef.current.stopListening();
    audioManagerRef.current.stopAllAudio();
    
    dispatch({ type: 'END_SESSION' });
  }, [dispatch]);

  // Handle barge-in when user speaks during AI response
  useEffect(() => {
    if (state.appStatus === 'speaking' && speechRecognitionRef.current.isCurrentlyListening()) {
      // Don't automatically barge-in, let user explicitly interrupt
      return;
    }

    if (state.appStatus === 'speaking' && currentTranscriptRef.current.trim()) {
      handleBargeIn();
    }
  }, [state.appStatus, handleBargeIn]);

  return {
    startSession,
    endSession,
    startListening,
    handleBargeIn,
    currentTranscript: currentTranscriptRef.current,
  };
}