import { Message } from '../types/conversation';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class ApiClient {
private token: string;

constructor(token: string) {
        this.token = token;
    }

    private async fetchWithAuth(url: string, options: RequestInit = {}) {
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
        };
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.message || 'API request failed');
        }
        return response;
    }

    async getHistory(): Promise<Message[]> {
        const response = await this.fetchWithAuth(`${API_BASE_URL}/history`);
        const data = await response.json();
        return data.history;
    }

    async sendMessage(
        message: string,
        conversationHistory: Message[],
        voiceId: string,
        onTextChunk: (chunk: string) => void,
        onAudioChunk: (chunk: Uint8Array) => void,
        languageCode: string = 'en' // New: Added languageCode parameter
    ): Promise<void> {
        const response = await this.fetchWithAuth(`${API_BASE_URL}/chat-stream`, {
            method: 'POST',
            body: JSON.stringify({
                message,
                conversationHistory,
                voiceId,
                languageCode, // Pass languageCode to the backend
            }),
        });

        if (!response.body) {
            throw new Error('Response body is empty');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedChunks = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            accumulatedChunks += decoder.decode(value, { stream: true });

            let boundary = accumulatedChunks.indexOf('\n');
            while (boundary !== -1) {
                const line = accumulatedChunks.substring(0, boundary).trim();
                accumulatedChunks = accumulatedChunks.substring(boundary + 1);

                if (line.startsWith('data:')) {
                    const jsonStr = line.substring(5).trim();
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.text_chunk) {
                            onTextChunk(data.text_chunk);
                        }
                        if (data.audio_chunk) {
                            const audioBytes = new Uint8Array(data.audio_chunk.data);
                            onAudioChunk(audioBytes);
                        }
                    } catch (e) {
                        console.error('Error parsing JSON from stream:', e, jsonStr);
                    }
                }
                boundary = accumulatedChunks.indexOf('\n');
            }
        }
    }
}