import { Message } from '../types/conversation';
import { UserSettings } from '../types/settings';
import { logger } from '../logger';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_KEY = import.meta.env.VITE_API_KEY;

export interface FeedbackResponse {
  summary: string;
  suggestions: string[];
}

export interface ApiRequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
}

interface ApiErrorPayload {
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
    
    Object.setPrototypeOf(this, ApiError.prototype);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extendedError = Error as any;
    if (typeof extendedError.captureStackTrace === 'function') {
      extendedError.captureStackTrace(this, ApiError);
    }
  }
}

export class ApiClient {
  private readonly token: string;
  // Track the configuration URL string inside the instance scope
  private readonly baseUrl: string;

  // FIXED: Constructor signature updated to accept an optional base URL parameter
  constructor(token: string, baseUrl?: string) {
    if (!token) {
      throw new Error('Security Exception: Cannot instantiate API client without a valid JSON Web Token authorization anchor.');
    }
    this.token = token;
    // Resolve dynamic parameter first, then look for static environment configurations
    this.baseUrl = baseUrl || API_BASE_URL || '';
  }

  private async fetchWithAuth(url: string, options: ApiRequestOptions = {}): Promise<Response> {
    const headersInstance = new Headers();
    
    headersInstance.set('Authorization', `Bearer ${this.token}`);
    headersInstance.set('Content-Type', 'application/json');

    if (API_KEY) {
      headersInstance.set('X-API-Key', API_KEY);
    }

    if (options.headers) {
      const headerKeys = Object.keys(options.headers);
      for (let i = 0; i < headerKeys.length; i++) {
        const key = headerKeys[i];
        headersInstance.set(key, options.headers[key]);
      }
    }

    // FIXED: Resolves paths smoothly using the dynamic instance base URL configuration context
    const cleanBase = this.baseUrl.replace(/\/$/, '');
    const cleanPath = url.replace(/^\//, '');
    const fullUrl = `${cleanBase}/${cleanPath}`;
    
    logger.debug(`API Request: ${options.method || 'GET'} ${fullUrl}`);

    const fetchInit: RequestInit = {
      method: options.method,
      body: options.body,
      mode: options.mode,
      credentials: options.credentials,
      cache: options.cache,
      redirect: options.redirect,
      referrer: options.referrer,
      integrity: options.integrity,
      signal: options.signal,
      headers: headersInstance
    };

    const response = await fetch(fullUrl, fetchInit);

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }
      
      const errorPayload = errorData as ApiErrorPayload;
      const errorMessage = errorPayload?.error || errorPayload?.message || 'An unknown network API error occurred.';
      
      logger.error(`API Error Response: ${response.status} captured on request to ${fullUrl}`, undefined, {
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
    return data.history as Message[];
  }

  async postTranscript(
    transcript: string, 
    options: { headers?: Record<string, string> } = {}
  ): Promise<{ responseText: string; audioData: ArrayBuffer }> {
    const response = await this.fetchWithAuth('/transcript', {
      method: 'POST',
      headers: options.headers,
      body: JSON.stringify({ transcript }),
    });

    const data = await response.json();

    interface InboundPayloadShape {
      responseText?: unknown;
      audioData?: unknown;
    }

    const parsedPayload = data as InboundPayloadShape;

    if (!parsedPayload || typeof parsedPayload.responseText !== 'string' || typeof parsedPayload.audioData !== 'string') {
      throw new ApiError('Structural Exception: Invalid response template signature returned from transcript endpoint.', 500, data);
    }

    try {
      const audioBytes = atob(parsedPayload.audioData);
      const audioBuffer = new ArrayBuffer(audioBytes.length);
      const audioView = new Uint8Array(audioBuffer);
      for (let i = 0; i < audioBytes.length; i++) {
        audioView[i] = audioBytes.charCodeAt(i);
      }

      return {
        responseText: parsedPayload.responseText,
        audioData: audioBuffer,
      };
    } catch (error) {
      throw new ApiError(`Codec Exception: Failed to decode base64 audio stream correctly: ${error instanceof Error ? error.message : String(error)}`, 500, data);
    }
  }

  async getAnalysis(conversationHistory: readonly Message[]): Promise<FeedbackResponse> {
    const response = await this.fetchWithAuth('/analyze', {
      method: 'POST',
      body: JSON.stringify({ conversationHistory }),
    });
    return response.json() as Promise<FeedbackResponse>;
  }

  async getSettings(): Promise<Partial<UserSettings>> {
    const response = await this.fetchWithAuth('/settings');
    return response.json() as Promise<Partial<UserSettings>>;
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const response = await this.fetchWithAuth('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    return response.json() as Promise<UserSettings>;
  }
}