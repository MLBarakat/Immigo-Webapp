import { describe, expect, it } from 'vitest';
import { conversationReducer, initialState, type Message } from '../conversationContextTypes';

describe('microphone-gated listening status', () => {
  it('does not advertise listening when a session starts — the mic is not acquired yet', () => {
    const started = conversationReducer(initialState, { type: 'START_SESSION' });

    expect(started.isSessionActive).toBe(true);
    // 'listening' is only set after useWhisper confirms mic access; until then
    // the session is merely connecting. 'connecting' renders as idle so a
    // consent/permission prompt never looks like "Thinking".
    expect(started.appStatus).toBe('connecting');
  });

  it('never reports a work state while a session is only connecting', () => {
    const started = conversationReducer(initialState, { type: 'START_SESSION' });

    expect(started.appStatus).not.toBe('listening');
    expect(started.appStatus).not.toBe('processing');
    expect(started.appStatus).not.toBe('speaking');
    expect(started.appStatus).not.toBe('error');
  });
});

describe('in-chat message actions', () => {
  const actions = [
    { kind: 'exam' as const, examAction: 'resume' as const, label: 'Continue exam', variant: 'primary' as const },
    { kind: 'exam' as const, examAction: 'new' as const, label: 'Start a new exam', variant: 'secondary' as const },
  ];

  it('keeps actions on the welcome message until they are resolved', () => {
    const withWelcome = conversationReducer(initialState, {
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: { assistantMessageId: 'welcome', content: 'Choose a direction', actions },
    });
    expect(withWelcome.conversationHistory[0].actions).toEqual(actions);

    const resolved = conversationReducer(withWelcome, {
      type: 'RESOLVE_MESSAGE_ACTIONS',
      payload: { messageId: 'welcome' },
    });
    expect(resolved.conversationHistory[0].actions).toBeUndefined();
  });

  it('clears welcome actions once the user starts a turn', () => {
    const withWelcome = conversationReducer(initialState, {
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: { assistantMessageId: 'welcome', content: 'Choose a direction', actions },
    });
    const sent = conversationReducer(withWelcome, {
      type: 'SEND_MESSAGE_START',
      payload: {
        userMessage: {
          id: 'user-1',
          role: 'user',
          content: 'I am ready',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        assistantMessageId: 'assistant-1',
      },
    });

    expect(sent.conversationHistory[0].actions).toBeUndefined();
  });
});

describe('assistant message lifecycle', () => {
  it('retains a recognized interim transcript when an empty pause update arrives', () => {
    const recognized = conversationReducer(initialState, {
      type: 'SET_INTERIM_TRANSCRIPT',
      payload: 'I think the answer is the executive branch',
    });
    const paused = conversationReducer(recognized, {
      type: 'SET_INTERIM_TRANSCRIPT',
      payload: '',
    });

    expect(paused.interimTranscript).toBe('I think the answer is the executive branch');
  });

  it('does not add an empty assistant bubble while a user message is processing', () => {
    const userMessage: Message = {
      id: 'user-1',
      role: 'user',
      content: 'My answer',
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    const processing = conversationReducer(initialState, {
      type: 'SEND_MESSAGE_START',
      payload: { userMessage, assistantMessageId: 'assistant-1' },
    });

    expect(processing.conversationHistory).toEqual([userMessage]);

    const ready = conversationReducer(processing, {
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: { assistantMessageId: 'assistant-1', content: 'The first word' },
    });
    expect(ready.conversationHistory.at(-1)?.content).toBe('The first word');

    const streamed = conversationReducer(ready, {
      type: 'RECEIVE_ASSISTANT_CHUNK',
      payload: { content: ' appears next.' },
    });
    expect(streamed.conversationHistory.at(-1)?.content).toBe('The first word appears next.');
  });

  it('adds standalone assistant notices without redirecting subsequent streamed chunks', () => {
    const withPendingReply = conversationReducer(initialState, {
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: { assistantMessageId: 'reply-1', content: 'The answer' },
    });
    const withReport = conversationReducer(withPendingReply, {
      type: 'ADD_STANDALONE_ASSISTANT_MESSAGE',
      payload: { assistantMessageId: 'report-1', content: 'Progress report' },
    });
    const streamed = conversationReducer(withReport, {
      type: 'RECEIVE_ASSISTANT_CHUNK',
      payload: { content: ' continues.' },
    });

    expect(streamed.conversationHistory.map(message => message.content)).toEqual([
      'The answer continues.',
      'Progress report',
    ]);
  });

  it('appends streamed chunks to an explicitly targeted standalone bubble', () => {
    const withPendingReply = conversationReducer(initialState, {
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: { assistantMessageId: 'reply-1', content: 'The answer' },
    });
    const withQuestion = conversationReducer(withPendingReply, {
      type: 'ADD_STANDALONE_ASSISTANT_MESSAGE',
      payload: { assistantMessageId: 'question-1', content: 'What next?' },
    });
    const streamed = conversationReducer(withQuestion, {
      type: 'RECEIVE_ASSISTANT_CHUNK',
      payload: { assistantMessageId: 'question-1', content: ' Really.' },
    });

    // The explicit target lets the next-question bubble keep receiving words
    // while the pending reply bubble is no longer the active stream target.
    expect(streamed.conversationHistory.map(message => message.content)).toEqual([
      'The answer',
      'What next? Really.',
    ]);
  });
});
