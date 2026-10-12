import { describe, expect, it } from 'vitest';
import { conversationReducer, initialState, type Message } from '../conversationContextTypes';

describe('assistant message lifecycle', () => {
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
});
