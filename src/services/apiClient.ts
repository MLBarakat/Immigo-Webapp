import { Message } from '../types/conversation';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ConversationResponse {
  responseText: string;
  responseAudio: string;
}

export class ApiClient {
  private apiKey: string;

  constructor(apiKey: string = 'demo-key') {
    this.apiKey = apiKey;
  }

  async sendMessage(
    message: string,
    conversationHistory: Message[],
    abortSignal?: AbortSignal
  ): Promise<ConversationResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          message,
          conversationHistory: conversationHistory.slice(-10), // Keep last 10 messages for context
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ConversationResponse = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request was cancelled');
      }
      
      console.error('API request failed:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to send message');
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      
      return response.ok;
    } catch {
      return false;
    }
  }
}