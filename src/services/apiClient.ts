import { Message } from '../types/conversation';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ConversationResponse {
responseText: string;
responseAudio: string;
}

export class ApiClient {
private token: string;

constructor(token: string) {
    this.token = token;
  }

  async getHistory(): Promise<Message[]> {
    const response = await fetch(`${API_BASE_URL}/api/history`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("401 Unauthorized");
      throw new Error("Failed to fetch history");
    }
    const data = await response.json();
    return data.map(msg => ({
        id: Math.random().toString(), // Or generate a more robust ID
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.created_at),
    }));
  }

  async sendMessage(
    message: string,
    conversationHistory: Message[],
    voiceId: string
  ): Promise<ConversationResponse> {
    const response = await fetch(`${API_BASE_URL}/api/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        message,
        conversationHistory: conversationHistory.slice(-10), // Send last 10 messages for context
        voiceId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API request failed with status ${response.status}`);
    }

    return response.json();
  }
}