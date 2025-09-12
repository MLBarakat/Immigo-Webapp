import { useCallback, useRef } from 'react';
import { useConversation } from '../context/ConversationContext';
import { useAuth } from '../context/AuthContext';
import { ApiClient } from '../services/apiClient';
import { SpeechRecognitionManager, StreamAudioManager } from '../utils/audioUtils';
import { v4 as uuidv4 } from 'uuid';
import { analytics } from '../analytics';

export const useConversationManager = () => {
const { state, dispatch } = useConversation();
const { session } = useAuth();

const recognitionManagerRef = useRef(new SpeechRecognitionManager());
const audioManagerRef = useRef(new StreamAudioManager());

const processAndRespond = useCallback(async (message: string) => {
if (!session) return;
        analytics.track('message_sent', { message_length: message.length });
        dispatch({ type: 'START_PROCESSING' });

        try {
            const apiClient = new ApiClient(session.access_token);
            let fullText = '';

            const assistantMessageId = uuidv4();
            const assistantMessagePartial = {
                id: assistantMessageId,
                role: 'assistant' as const,
                content: '...',
                timestamp: new Date(),
            };
            dispatch({ type: 'ADD_MESSAGE', payload: assistantMessagePartial });

            dispatch({ type: 'START_SPEAKING' });

            audioManagerRef.current.setOnEnded(() => {
                dispatch({ type: 'STOP_SPEAKING' });
                if (state.isSessionActive) {
                    startSession();
                }
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
    }, [state.conversationHistory, state.isSessionActive, state.voiceId, session, dispatch]);

    const startSession = useCallback(() => {
        analytics.track('session_started');
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
            () => {
                if (state.isSessionActive && state.appStatus === 'listening') {
                    // If listening ended without a final result, just restart it.
                    startSession();
                }
            }
        );
    }, [dispatch, processAndRespond, state.isSessionActive, state.appStatus]);

    const endSession = useCallback(() => {
        analytics.track('session_ended');
        recognitionManagerRef.current.stopListening();
        audioManagerRef.current.stop();
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