import amplifyOutputs from '../../amplify_outputs.json';
import { Message } from '../context/conversationContextTypes';
import { UserSettings } from '../types/settings';
import { logger } from '../logger';

const API_BASE_URL = (amplifyOutputs as { custom?: { apiBaseUrl?: string; API_URL?: string } }).custom?.apiBaseUrl || import.meta.env.VITE_API_BASE_URL || '';
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

  private buildRequestUrl(url: string): string {
    const normalizedPath = url.replace(/^\//, '');

    if (!this.baseUrl) {
      return normalizedPath ? `/${normalizedPath}` : '/';
    }

    const normalizedBase = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    return new URL(normalizedPath, normalizedBase).toString();
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

    const fullUrl = this.buildRequestUrl(url);

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

  async deleteAccount(): Promise<void> {
    // Server validates the caller's JWT and deletes ONLY that user; cascade
    // removes all associated data. Returns 200 on success.
    await this.fetchWithAuth('/delete-account', { method: 'POST' });
  }

  async getHistory(): Promise<Message[]> {
    const response = await this.fetchWithAuth('/history');
    const data = await response.json();
    return data.history as Message[];
  }

  /** Shared request/response handling for /transcript, used by both a normal
   * turn (postTranscript) and the proactive session-start call
   * (postSessionStart) — same response shape, different request body. */
  private async sendTranscriptRequest(
    body: Record<string, unknown>,
    options: { headers?: Record<string, string> } = {}
  ): Promise<{
    responseText: string;
    audioData: ArrayBuffer;
    verdict: 'correct' | 'incorrect' | 'partial' | null;
    needsConfirmation: boolean;
    nextItemId: string | null;
    nextQuestion: string | null;
  }> {
    let response: Response;
    try {
      response = await this.fetchWithAuth('/transcript', {
        method: 'POST',
        headers: options.headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      logger.error('[ApiClient] transcript endpoint network/CORS exception:', undefined, {
        error: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }

    logger.info(`[ApiClient] transcript endpoint HTTP status: ${response.status} ${response.statusText}`);

    const data = await response.json();

    interface InboundPayloadShape {
      responseText?: unknown;
      audioData?: unknown;
      verdict?: unknown;
      needsConfirmation?: unknown;
      nextItemId?: unknown;
      nextQuestion?: unknown;
      error?: string;
    }

    const parsedPayload = data as InboundPayloadShape;

    if (!response.ok || parsedPayload.error) {
      const errMessage = parsedPayload.error || `HTTP ${response.status} ${response.statusText}`;
      logger.error('[ApiClient] transcript endpoint error response from server:', undefined, {
        status: response.status,
        error: errMessage,
        payload: data
      });
      throw new ApiError(`Server Error (${response.status}): ${errMessage}`, response.status, data);
    }

    if (!parsedPayload || typeof parsedPayload.responseText !== 'string' || typeof parsedPayload.audioData !== 'string') {
      logger.error('[ApiClient] Structural Exception in transcript endpoint payload shape:', undefined, { data });
      throw new ApiError('Structural Exception: Invalid response template signature returned from transcript endpoint.', 500, data);
    }

    try {
      const audioBytes = atob(parsedPayload.audioData);
      const audioBuffer = new ArrayBuffer(audioBytes.length);
      const audioView = new Uint8Array(audioBuffer);
      for (let i = 0; i < audioBytes.length; i++) {
        audioView[i] = audioBytes.charCodeAt(i);
      }

      const rawVerdict = parsedPayload.verdict;
      const verdict =
        rawVerdict === 'correct' || rawVerdict === 'incorrect' || rawVerdict === 'partial'
          ? rawVerdict
          : null;
      const needsConfirmation = parsedPayload.needsConfirmation === true;
      const nextItemId = typeof parsedPayload.nextItemId === 'string' ? parsedPayload.nextItemId : null;
      const nextQuestion = typeof parsedPayload.nextQuestion === 'string' ? parsedPayload.nextQuestion : null;

      logger.info('[ApiClient] transcript endpoint payload parsed and decoded successfully.');
      return {
        responseText: parsedPayload.responseText,
        audioData: audioBuffer,
        verdict,
        needsConfirmation,
        nextItemId,
        nextQuestion,
      };
    } catch (error) {
      logger.error('[ApiClient] Codec Exception decoding audio stream:', undefined, { error: String(error) });
      throw new ApiError(`Codec Exception: Failed to decode base64 audio stream correctly: ${error instanceof Error ? error.message : String(error)}`, 500, data);
    }
  }

  async postTranscript(
    transcript: string,
    conversationWindow: Array<{ role: string; content: string }> = [],
    sessionId?: string | null,
    currentItemId?: string | null,
    confirmationRetry?: boolean,
    options: { headers?: Record<string, string> } = {}
  ): Promise<{
    responseText: string;
    audioData: ArrayBuffer;
    verdict: 'correct' | 'incorrect' | 'partial' | null;
    needsConfirmation: boolean;
    nextItemId: string | null;
    nextQuestion: string | null;
  }> {
    logger.info('[ApiClient] Dispatching postTranscript request:', {
      transcriptLength: transcript.length,
      windowTurns: conversationWindow.length,
      sessionId
    });
    return this.sendTranscriptRequest(
      { transcript, conversationWindow, sessionId, currentItemId, confirmationRetry },
      options
    );
  }

  /**
   * Proactive session-start call (item 6): fired automatically the moment a
   * session begins, BEFORE any user speech, so the personalized greeting
   * speaks first instead of waiting for a garbled first utterance to trigger
   * it implicitly. No transcript required.
   */
  async postSessionStart(
    sessionId?: string | null,
    options: { headers?: Record<string, string> } = {}
  ): Promise<{
    responseText: string;
    audioData: ArrayBuffer;
    verdict: 'correct' | 'incorrect' | 'partial' | null;
    needsConfirmation: boolean;
    nextItemId: string | null;
    nextQuestion: string | null;
  }> {
    logger.info('[ApiClient] Dispatching postSessionStart request:', { sessionId });
    return this.sendTranscriptRequest({ sessionStart: true, sessionId }, options);
  }

  async completeSession(sessionId: string): Promise<void> {
    if (!sessionId) return;
    try {
      logger.info(`[ApiClient] Dispatching completeSession for sessionId: ${sessionId}`);
      const fullUrl = this.buildRequestUrl('/complete-session');
      const headersInstance = new Headers();
      headersInstance.set('Authorization', `Bearer ${this.token}`);
      headersInstance.set('Content-Type', 'application/json');

      if (API_KEY) {
        headersInstance.set('X-API-Key', API_KEY);
      }

      const res = await fetch(fullUrl, {
        method: 'POST',
        headers: headersInstance,
        body: JSON.stringify({ sessionId }),
        keepalive: true,
      });
      logger.info(`[ApiClient] completeSession response status: ${res.status}`);

      if (!res.ok) {
        let errorData: unknown;
        try {
          errorData = await res.json();
        } catch {
          errorData = { message: res.statusText };
        }

        logger.error(`[ApiClient] completeSession error response from server for ${sessionId}:`, undefined, {
          status: res.status,
          responseData: errorData,
        });
      }
    } catch (error) {
      logger.error(`[ApiClient] Failed to dispatch completeSession for ${sessionId}:`, undefined, {
        error: error instanceof Error ? error.message : String(error),
      });
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
