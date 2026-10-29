import type React from 'react';
import { createContext } from 'react';

// Synchronized directly with the Authoritative FSM state machine targets
// 'connecting' = a session is being set up and the microphone has not been
// confirmed yet. It renders as idle: mic consent/permission prompts must never
// look like "Thinking", and the pill must not claim to listen before capture
// actually runs.
export type AppStatus = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error';
export type SimulationMode = 'standard' | 'practice' | 'study';
export type TestVersion = '2008' | '2020';

export type MessageAction = {
  kind: 'exam';
  examAction: 'new' | 'resume';
  label: string;
  variant?: 'primary' | 'secondary';
};

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** Optional in-chat actions rendered with the message (e.g. welcome choices). */
  actions?: readonly MessageAction[];
}

export interface LiveSessionStats {
  answered: number;
  correct: number;
  incorrect: number;
  partial: number;
  accuracyPct: number;
  missedItemIds: string[];
}

export interface ConversationState {
  conversationHistory: readonly Message[];
  appStatus: AppStatus;
  isSessionActive: boolean;
  sessionTime: number;
  errorMessage: string | null;
  transcript: string;
  interimTranscript: string; // Used exclusively as an interim text holder
  currentLanguageCode: string;
  assistantMessageId: string | null;
  sessionId: string | null;
  hasMoreHistory: boolean;
  oldestMessageCursor: string | null;
  /** Free, real-time stats computed from graded_answers — not the expensive
   * LLM-generated narrative report. Null until the first answer this session. */
  liveStats: LiveSessionStats | null;
}

export type ConversationAction =
  | { type: 'START_SESSION' }
  | { type: 'END_SESSION' }
  | { type: 'SET_TRANSCRIPT'; payload: string }
  | { type: 'SET_INTERIM_TRANSCRIPT'; payload: string }
  | { type: 'CLEAR_CONVERSATION' }
  | { type: 'TICK_SESSION_TIMER' }
  | { type: 'SET_LANGUAGE'; payload: string }
  | { type: 'SEND_MESSAGE_START'; payload: { userMessage: Message; assistantMessageId: string } }
  | { type: 'RECEIVE_ASSISTANT_CHUNK'; payload: { content: string } }
  | { type: 'FINISH_ASSISTANT_RESPONSE' }
  | { type: 'SEND_MESSAGE_FAILURE'; payload: { error: string; userMessageId: string; assistantMessageId: string } }
  | { type: 'SEND_MESSAGE_ROLLBACK'; payload: { userMessageId: string; assistantMessageId: string } }
  | { type: 'REMOVE_PENDING_ASSISTANT_MESSAGE'; payload: { assistantMessageId: string } }
  | { type: 'SET_STATUS'; payload: AppStatus }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_SESSION_ID'; payload: string | null }
  | { type: 'LOAD_HISTORICAL_MESSAGES'; payload: { messages: Message[]; hasMore: boolean; oldestCursor: string | null; replace?: boolean } }
  | { type: 'SET_LIVE_STATS'; payload: LiveSessionStats | null }
  | { type: 'ADD_ASSISTANT_MESSAGE'; payload: { assistantMessageId: string; content: string; actions?: readonly MessageAction[] } }
  | { type: 'ADD_STANDALONE_ASSISTANT_MESSAGE'; payload: { assistantMessageId: string; content: string; actions?: readonly MessageAction[] } }
  | { type: 'RESOLVE_MESSAGE_ACTIONS'; payload: { messageId?: string } };

export const initialState: ConversationState = {
  conversationHistory: [],
  appStatus: 'idle',
  isSessionActive: false,
  sessionTime: 0,
  errorMessage: null,
  transcript: '',
  interimTranscript: '',
  currentLanguageCode: 'en-US',
  assistantMessageId: null,
  sessionId: null,
  hasMoreHistory: false,
  oldestMessageCursor: null,
  liveStats: null,
};

export const conversationReducer = (state: ConversationState, action: ConversationAction): ConversationState => {
  switch (action.type) {
    case 'START_SESSION':
      // 'listening' is microphone-gated: starting a session must not advertise
      // listening before the mic has actually been acquired (see
      // useConversation.startListeningWithMicGate). 'connecting' renders as
      // idle so a consent/permission prompt never looks like "Thinking".
      return { 
        ...state, 
        isSessionActive: true, 
        sessionTime: 0, 
        appStatus: 'connecting', 
        errorMessage: null, 
        interimTranscript: '',
        liveStats: null
      };

    case 'END_SESSION':
      return { 
        ...state, 
        isSessionActive: false, 
        appStatus: 'idle', 
        interimTranscript: '',
      };

    case 'SET_LIVE_STATS':
      return { ...state, liveStats: action.payload };

    case 'ADD_ASSISTANT_MESSAGE': {
      // Add the assistant bubble only after its first content is ready. System
      // messages have no paired user turn, and normal responses must not show
      // an empty placeholder while the server is still generating them.
      const message: Message = {
        id: action.payload.assistantMessageId,
        role: 'assistant',
        content: action.payload.content,
        timestamp: new Date().toISOString(),
        ...(action.payload.actions?.length ? { actions: action.payload.actions } : {}),
      };
      return {
        ...state,
        conversationHistory: [...state.conversationHistory, message],
        assistantMessageId: action.payload.assistantMessageId,
      };
    }

    case 'ADD_STANDALONE_ASSISTANT_MESSAGE': {
      const message: Message = {
        id: action.payload.assistantMessageId,
        role: 'assistant',
        content: action.payload.content,
        timestamp: new Date().toISOString(),
        ...(action.payload.actions?.length ? { actions: action.payload.actions } : {}),
      };
      return { ...state, conversationHistory: [...state.conversationHistory, message] };
    }

    case 'SET_TRANSCRIPT':
      return { ...state, transcript: action.payload, appStatus: 'listening' };

    case 'SET_INTERIM_TRANSCRIPT':
      return action.payload.trim()
        ? { ...state, interimTranscript: action.payload }
        : state;

    case 'SET_STATUS':
      return { ...state, appStatus: action.payload };

    case 'CLEAR_CONVERSATION':
      return {
        ...state,
        conversationHistory: [],
        interimTranscript: '',
        oldestMessageCursor: null,
        hasMoreHistory: false,
        liveStats: null,
        sessionId: null,
        sessionTime: 0,
        isSessionActive: false,
        appStatus: 'idle',
      };

    case 'TICK_SESSION_TIMER':
      return { ...state, sessionTime: state.isSessionActive ? state.sessionTime + 1 : 0 };

    case 'SET_LANGUAGE':
      return { ...state, currentLanguageCode: action.payload };

    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.payload };

    case 'LOAD_HISTORICAL_MESSAGES': {
      const { messages: newMessages, hasMore, oldestCursor, replace } = action.payload;
      return {
        ...state,
        conversationHistory: replace ? newMessages : [...newMessages, ...state.conversationHistory],
        hasMoreHistory: hasMore,
        oldestMessageCursor: oldestCursor || state.oldestMessageCursor,
      };
    }

    case 'SEND_MESSAGE_START': {
      return {
        ...state,
        appStatus: 'processing',
        transcript: '',
        interimTranscript: '', // Clear speculative holder on prompt dispatch
        errorMessage: null,
        conversationHistory: [
          ...state.conversationHistory.map(msg => msg.actions ? { ...msg, actions: undefined } : msg),
          action.payload.userMessage,
        ],
        assistantMessageId: action.payload.assistantMessageId,
      };
    }

    case 'RESOLVE_MESSAGE_ACTIONS':
      return {
        ...state,
        conversationHistory: state.conversationHistory.map(msg => {
          if (!msg.actions) return msg;
          if (action.payload.messageId && msg.id !== action.payload.messageId) return msg;
          return { ...msg, actions: undefined };
        }),
      };

    case 'RECEIVE_ASSISTANT_CHUNK':
      if (!state.assistantMessageId) return state;
      return {
        ...state,
        appStatus: 'speaking',
        conversationHistory: state.conversationHistory.map(msg =>
          msg.id === state.assistantMessageId ? { ...msg, content: msg.content + action.payload.content } : msg
        ),
      };

    case 'FINISH_ASSISTANT_RESPONSE':
      return {
        ...state,
        appStatus: state.isSessionActive ? 'listening' : 'idle',
        assistantMessageId: null,
      };

    case 'SEND_MESSAGE_FAILURE':
      // FIXED: Perform an atomic array filter on error to eradicate UI ghost messages
      return {
        ...state,
        appStatus: 'error',
        errorMessage: action.payload.error,
        assistantMessageId: null,
        conversationHistory: state.conversationHistory.filter(
          msg => msg.id !== action.payload.userMessageId && msg.id !== action.payload.assistantMessageId
        ),
      };

    case 'SEND_MESSAGE_ROLLBACK':
      return {
        ...state,
        conversationHistory: state.conversationHistory.filter(
          msg => msg.id !== action.payload.userMessageId && msg.id !== action.payload.assistantMessageId
        ),
      };

    case 'REMOVE_PENDING_ASSISTANT_MESSAGE':
      return {
        ...state,
        conversationHistory: state.conversationHistory.filter(
          msg => msg.id !== action.payload.assistantMessageId
        ),
      };

    case 'CLEAR_ERROR':
      return { ...state, errorMessage: null, appStatus: 'idle' };

    default:
      return state;
  }
};

export interface ConversationContextType {
  state: ConversationState;
  dispatch: React.Dispatch<ConversationAction>;
}

export const ConversationContext = createContext<ConversationContextType | undefined>(undefined);
