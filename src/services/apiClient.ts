import { Message } from '../types/conversation';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class ApiClient {
private headers: HeadersInit;

constructor(token: string) {
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-API-Key': import.meta.env.VITE_API_KEY,
    };
  }

  async getHistory(): Promise<Message[]> {
    const response = await fetch(`${API_BASE_URL}/api/history`, {
      headers: this.headers,
    });
    if (!response.ok) {
      throw new Error("Failed to fetch history");
    }
    return response.json();
  }

  async sendMessage(
    message: string,
    conversationHistory: Message[],
    voiceId: string,
    onTextChunk: (chunk: string) => void,
    onAudioChunk: (chunk: string) => void
  ): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/conversation`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ message, conversationHistory: conversationHistory.slice(-10), voiceId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API request failed with status ${response.status}`);
    }

    if (!response.body) {
        throw new Error("Response body is null or undefined.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n');
        buffer = chunks.pop() || '';
        for (const chunkStr of chunks) {
            if (chunkStr) {
                try {
                    const chunk = JSON.parse(chunkStr);
                    if (chunk.type === 'text_chunk') onTextChunk(chunk.data);
                    if (chunk.type === 'audio_chunk') onAudioChunk(chunk.data);
                } catch(e) {
                    console.error("Failed to parse JSON chunk:", chunkStr);
                }
            }
        }
    }
  }
}