import { Message } from '../types/conversation';
import { UserSettings } from '../types/settings';
import { logger } from '../logger';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_KEY = import.meta.env.VITE_API_KEY;

export interface FeedbackResponse {
  summary: string;
  suggestions: string[];
}

// Custom error class for API-specific errors
export class ApiError extends Error {
  public readonly status: number;
  public readonly data: any;

  constructor(message: string, status: number, data: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

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

    const fullUrl = `${API_BASE_URL}${url}`;
    logger.debug(`API Request: ${options.method || 'GET'} ${fullUrl}`);

    const response = await fetch(fullUrl, { ...options, headers });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }
      
      const errorMessage = errorData.error || errorData.message || 'An unknown API error occurred.';
      logger.error(`API Error: ${response.status} on ${options.method || 'GET'} ${fullUrl}`, undefined, {
        status: response.status,
        responseData: errorData,
      });

      throw new ApiError(errorMessage, response.status, errorData);
    }

    return response;
  }

  async getHistory(): Promise<Message[]> {
    const response = await this.fetchWithAuth('/api/history');
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
    const response = await this.fetchWithAuth('/api/conversation', {
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

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        try {
          const parsedChunk = JSON.parse(chunk);
          if (parsedChunk.type === 'text') {
            onTextChunk(parsedChunk.data);
          } else if (parsedChunk.type === 'audio') {
            const audioData = new Uint8Array(parsedChunk.data);
            onAudioChunk(audioData);
          }
        } catch (e) {
          logger.error('Error parsing stream chunk', e);
        }
      }
    }
  }

  async getAnalysis(conversationHistory: readonly Message[]): Promise<FeedbackResponse> {
    const response = await this.fetchWithAuth('/api/conversation/analyze', {
      method: 'POST',
      body: JSON.stringify({ conversationHistory }),
    });
    return response.json();
  }

  async getSettings(): Promise<Partial<UserSettings>> {
    const response = await this.fetchWithAuth('/api/settings');
    return response.json();
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const response = await this.fetchWithAuth('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    return response.json();
  }
}
