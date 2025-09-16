import { Message } from '../types/conversation';
import { UserSettings } from '../types/settings'; // <-- ADDED

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_KEY = import.meta.env.VITE_API_KEY;

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
            'X-API-Key': API_KEY,
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
        conversationId: string,
        userMessageText: string,
        pollyVoiceId: string,
        languageCode: string,
        micMode: 'voice_activity' | 'push_to_talk',
        bargeIn: 'relaxed' | 'balanced' | 'aggressive',
        liveFeedbackEnabled: boolean,
        onTextChunk: (textChunk: string) => void,
        onAudioChunk: (audioChunk: Uint8Array) => void
    ): Promise<void> {
        const response = await this.fetchWithAuth(`${API_BASE_URL}/chat-stream`, {
            method: 'POST',
            body: JSON.stringify({
                conversationId,
                message: userMessageText,
                pollyVoiceId,
                languageCode,
                micMode,
                bargeIn,
                liveFeedbackEnabled,
            }),
        });

        if (!response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                try {
                    const parsedChunk = JSON.parse(chunk);
                    if (parsedChunk.type === 'text') {
                        onTextChunk(parsedChunk.data);
                    } else if (parsedChunk.type === 'audio') {
                        const audioData = new Uint8Array(parsedChunk.data); // Assuming data is base64 or arraybuffer
                        onAudioChunk(audioData);
                    }
                } catch (e) {
                    onTextChunk(chunk);
                }
            }
        }
    }

    async getSettings(): Promise<Partial<UserSettings>> {
        const response = await this.fetchWithAuth(`${API_BASE_URL}/settings`);
        return response.json();
    }

    async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
        const response = await this.fetchWithAuth(`${API_BASE_URL}/settings`, {
            method: 'PUT',
            body: JSON.stringify(settings),
        });
        return response.json();
    }
}