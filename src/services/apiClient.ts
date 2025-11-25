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

    const cleanBase = (API_BASE_URL || '').replace(/\/$/, '');
    const cleanPath = url.replace(/^\//, '');
    const fullUrl = `${cleanBase}/${cleanPath}`;
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
    const response = await this.fetchWithAuth('/history');
    const data = await response.json();
    return data.history;
  }

  async postTranscript(transcript: string): Promise<{ responseText: string, audioData: ArrayBuffer }> {
    const response = await this.fetchWithAuth('/transcript', {
      method: 'POST',
      body: JSON.stringify({ transcript }),
    });

    // Expect a JSON response with the assistant's text and base64-encoded audio
    const data = await response.json();

    if (!data.responseText || !data.audioData) {
      throw new ApiError('Invalid response from transcript endpoint', 500, data);
    }

    // Decode the base64 audio data into an ArrayBuffer
    const audioBytes = atob(data.audioData);
    const audioBuffer = new ArrayBuffer(audioBytes.length);
    const audioView = new Uint8Array(audioBuffer);
    for (let i = 0; i < audioBytes.length; i++) {
      audioView[i] = audioBytes.charCodeAt(i);
    }

    return {
      responseText: data.responseText,
      audioData: audioBuffer,
    };
  }

  async getAnalysis(conversationHistory: readonly Message[]): Promise<FeedbackResponse> {
    const response = await this.fetchWithAuth('/analyze', {
      method: 'POST',
      body: JSON.stringify({ conversationHistory }),
    });
    return response.json();
  }

  async getSettings(): Promise<Partial<UserSettings>> {
    const response = await this.fetchWithAuth('/settings');
    return response.json();
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const response = await this.fetchWithAuth('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    return response.json();
  }
}