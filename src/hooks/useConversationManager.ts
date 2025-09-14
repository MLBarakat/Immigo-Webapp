import { useCallback, useRef, useEffect } from 'react';
import { useConversation } from '../context/ConversationContext';
import { useAuth } from './useAuth';
import { ApiClient } from '../services/apiClient';
import { SpeechRecognitionManager, StreamAudioManager } from '../utils/audioUtils';
import { v4 as uuidv4 } from 'uuid';
import { analytics } from '../analytics';

export const useConversationManager = () => {
const { state, dispatch } = useConversation();
const { session } = useAuth();

const recognitionManagerRef = useRef(new SpeechRecognitionManager());
const audioManagerRef = useRef(new StreamAudioManager());
const sessionTimerRef = useRef<number | null>(null);

useEffect(() => {
        if (state.isSessionActive && sessionTimerRef.current === null) {
            sessionTimerRef.current = window.setInterval(() => {
                dispatch({ type: 'TICK_SESSION_TIMER' });
            }, 1000);
        } else if (!state.isSessionActive && sessionTimerRef.current !== null) {
            clearInterval(sessionTimerRef.current);
            sessionTimerRef.current = null;
        }
        return () => {
            if (sessionTimerRef.current) {
                clearInterval(sessionTimerRef.current);
            }
        };
    }, [state.isSessionActive, dispatch]);

    const processAndRespond = useCallback(async (message: string) => {
        if (!session) return;
        analytics.track('message_sent', { message_length: message.length });
        dispatch({ type: 'START_PROCESSING' });

        try {
            const apiClient = new ApiClient(session.access_token);
            let fullText = '';

            const assistantMessageId = uuidv4();
            dispatch({ type: 'ADD_MESSAGE', payload: { id: assistantMessageId, role: 'assistant', content: '...', timestamp: new Date() }});
            dispatch({ type: 'START_SPEAKING' });

            audioManagerRef.current.setOnEnded(() => {
                dispatch({ type: 'STOP_SPEAKING' });
            });

            await apiClient.sendMessage(
                message,
                state.conversationHistory,
                state.voiceId,
                (textChunk) => {
                    fullText += textChunk;
                    dispatch({ type: 'UPDATE_MESSAGE', payload: { id: assistantMessageId, content: fullText } });
                },
                (audioChunk) => {
                    audioManagerRef.current.addChunk(audioChunk);
                }
            );

            analytics.track('response_received', { response_length: fullText.length });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            dispatch({ type: 'SET_ERROR', payload: `Failed to get response: ${errorMessage}` });
            analytics.track('api_error', { error_message: errorMessage });
            dispatch({ type: 'STOP_SPEAKING' });
        }
    }, [state.conversationHistory, state.voiceId, session, dispatch]);

    const startSession = useCallback(() => {
        analytics.track('session_started');
        dispatch({ type: 'START_SESSION', payload: { clearHistory: true } });
        recognitionManagerRef.current.startListening(
            (transcript, isFinal) => {
                if (isFinal && transcript.trim()) {
                    const userMessage = { id: uuidv4(), role: 'user' as const, content: transcript, timestamp: new Date() };
                    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
                    processAndRespond(transcript);
                }
            },
            (error) => {
                dispatch({ type: 'SET_ERROR', payload: error });
            },
            () => {}
        );
    }, [dispatch, processAndRespond]);

    const endSession = useCallback(() => {
        analytics.track('session_ended');
        recognitionManagerRef.current.stopListening();
        audioManagerRef.current.stop();
        dispatch({ type: 'END_SESSION' });
    }, [dispatch]);

    const sendTextMessage = useCallback(async (message: string) => {
        if (!message.trim()) return;

        if (!state.isSessionActive) {
            dispatch({ type: 'START_SESSION', payload: { clearHistory: false } });
        }

        const userMessage = {
            id: uuidv4(),
            role: 'user' as const,
            content: message,
            timestamp: new Date(),
        };
        dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
        await processAndRespond(message);
    }, [dispatch, processAndRespond, state.isSessionActive]);

    const clearConversation = useCallback(() => {
        dispatch({ type: 'CLEAR_HISTORY' });
    }, [dispatch]);

    const downloadTranscript = useCallback(() => {
        const transcript = state.conversationHistory
            .map(msg => `${new Date(msg.timestamp).toLocaleTimeString()} - ${msg.role.toUpperCase()}: ${msg.content}`)
            .join('\n');

        const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `immigo-transcript-${new Date().toISOString()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [state.conversationHistory]);

    return { startSession, endSession, sendTextMessage, clearConversation, downloadTranscript };
};