import amplifyOutputs from '../../amplify_outputs.json';
import { logger } from '../logger';
import { markDocTombstone } from '../utils/docTombstone';
import type { SimulationMode, TestVersion } from '../context/conversationContextTypes';

const API_BASE_URL = (amplifyOutputs as { custom?: { apiBaseUrl?: string; API_URL?: string } }).custom?.apiBaseUrl || import.meta.env.VITE_API_BASE_URL || '';
// NOTE: no VITE_API_KEY here by design. A key baked into the web bundle is
// public to anyone who downloads the JS, so it cannot serve as a secret.
// The backend does not validate X-API-Key; requests authenticate with the
// short-lived Bearer session token instead.

export interface ApiRequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
}

interface ApiErrorPayload {
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export type MockExamAction = 'new' | 'resume';

export interface MockExamFeedback {
  summary: string;
  strengths: string[];
  suggestions: string[];
  recommendedMode: 'practice' | 'study';
  recommendationReason: string;
}

export interface MockExamReview {
  report: string;
  feedback: MockExamFeedback;
}

/**
 * Reduces unknown server payloads to shape metadata for logs. Full bodies
 * can echo user transcripts or PII and must never reach the console.
 */
function summarizePayloadForLog(value: unknown): Record<string, unknown> {
  try {
    if (value && typeof value === 'object') {
      const keys = Object.keys(value as Record<string, unknown>);
      return { keys, size: JSON.stringify(value)?.length ?? 0 };
    }
    return { type: typeof value };
  } catch {
    return { type: typeof value };
  }
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

      logger.error(`API Error Response: ${response.status} captured on request to ${fullUrl}`, {
        status: response.status,
        errorMessage: errorMessage.slice(0, 500),
        responseShape: summarizePayloadForLog(errorData),
      });

      throw new ApiError(errorMessage, response.status, errorData);
    }

    return response;
  }

  async deleteAccount(): Promise<void> {
    const response = await this.fetchWithAuth('/delete-account', { method: 'POST' });
    const data: unknown = await response.json();
    if (!isRecord(data) || data.deleted !== true) {
      throw new ApiError('Structural Exception: Invalid account deletion response.', 500, data);
    }
  }

  /** Shared request/response handling for /transcript calls. */
  private async sendTranscriptRequest(
    body: Record<string, unknown>,
    options: { headers?: Record<string, string>; signal?: AbortSignal } = {}
  ): Promise<{
    responseText: string;
    audioData: ArrayBuffer;
    verdict: 'correct' | 'incorrect' | 'partial' | null;
    needsConfirmation: boolean;
    nextItemId: string | null;
    nextQuestion: string | null;
    assistantSegments: string[];
    examRunId: string | null;
    examCompleted: boolean;
    examReport: string | null;
    examReviewId: string | null;
    examStage: 'none' | 'reading' | 'writing' | 'complete' | null;
    modeGoalPending: boolean;
  }> {
    let response: Response;
    try {
      response = await this.fetchWithAuth('/transcript', {
        method: 'POST',
        headers: options.headers,
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        // fetchWithAuth already parsed the server's JSON body. This is an HTTP
        // error from the backend (e.g. a Lambda 500), NOT a CORS/network
        // failure — surface the real message instead of mislabelling it.
        logger.error('[ApiClient] transcript endpoint server error:', {
          status: err.status,
          error: err.message,
          payloadShape: summarizePayloadForLog(err.data),
        });
        throw err;
      }
      logger.error('[ApiClient] transcript endpoint network/CORS exception:', {
        error: err instanceof Error ? err.message : String(err),
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
      assistantSegments?: unknown;
      examRunId?: unknown;
      examCompleted?: unknown;
      examReport?: unknown;
      examReviewId?: unknown;
      examStage?: unknown;
      modeGoalPending?: unknown;
      error?: string;
    }

    const parsedPayload = data as InboundPayloadShape;

    if (!response.ok || parsedPayload.error) {
      const errMessage = parsedPayload.error || `HTTP ${response.status} ${response.statusText}`;
      logger.error('[ApiClient] transcript endpoint error response from server:', undefined, {
        status: response.status,
        error: errMessage,
        payloadShape: summarizePayloadForLog(data)
      });
      throw new ApiError(`Server Error (${response.status}): ${errMessage}`, response.status, data);
    }

    if (!parsedPayload || typeof parsedPayload.responseText !== 'string' || typeof parsedPayload.audioData !== 'string') {
      logger.error('[ApiClient] Structural Exception in transcript endpoint payload shape:', undefined, { shape: summarizePayloadForLog(data) });
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
      const assistantSegments = Array.isArray(parsedPayload.assistantSegments)
        ? parsedPayload.assistantSegments.filter((segment): segment is string => typeof segment === 'string' && segment.trim().length > 0)
        : [parsedPayload.responseText];

      logger.info('[ApiClient] transcript endpoint payload parsed and decoded successfully.');
      return {
        responseText: parsedPayload.responseText,
        audioData: audioBuffer,
        verdict,
        needsConfirmation,
        nextItemId,
        nextQuestion,
        assistantSegments: assistantSegments.length > 0 ? assistantSegments : [parsedPayload.responseText],
        examRunId: typeof parsedPayload.examRunId === 'string' ? parsedPayload.examRunId : null,
        examCompleted: parsedPayload.examCompleted === true,
        examReport: typeof parsedPayload.examReport === 'string' ? parsedPayload.examReport : null,
        examReviewId: typeof parsedPayload.examReviewId === 'string' ? parsedPayload.examReviewId : null,
        examStage: parsedPayload.examStage === 'reading' || parsedPayload.examStage === 'writing' || parsedPayload.examStage === 'complete' || parsedPayload.examStage === 'none' ? parsedPayload.examStage : null,
        modeGoalPending: parsedPayload.modeGoalPending === true,
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
    confirmationRetryOrOptions?: boolean | { headers?: Record<string, string>; signal?: AbortSignal; voiceId?: string; simulationMode?: SimulationMode; preferredLanguage?: string; openingResponse?: boolean; testVersion?: TestVersion; includeEnglishSimulation?: boolean; examRunId?: string | null; modeGoalResponse?: boolean; examAction?: MockExamAction; inputMethod?: 'text' | 'voice'; requestId?: string; postExamId?: string | null },
    options: { headers?: Record<string, string>; signal?: AbortSignal; voiceId?: string; simulationMode?: SimulationMode; preferredLanguage?: string; openingResponse?: boolean; testVersion?: TestVersion; includeEnglishSimulation?: boolean; examRunId?: string | null; modeGoalResponse?: boolean; examAction?: MockExamAction; inputMethod?: 'text' | 'voice'; requestId?: string; postExamId?: string | null } = {}
  ): Promise<{
    responseText: string;
    audioData: ArrayBuffer;
    verdict: 'correct' | 'incorrect' | 'partial' | null;
    needsConfirmation: boolean;
    nextItemId: string | null;
    nextQuestion: string | null;
    assistantSegments: string[];
    examRunId: string | null;
    examCompleted: boolean;
    examReport: string | null;
    examReviewId: string | null;
    examStage: 'none' | 'reading' | 'writing' | 'complete' | null;
    modeGoalPending: boolean;
  }> {
    let confirmationRetry: boolean | undefined;
    let effectiveOptions = options;
    if (typeof confirmationRetryOrOptions === 'boolean') {
      confirmationRetry = confirmationRetryOrOptions;
    } else if (confirmationRetryOrOptions && typeof confirmationRetryOrOptions === 'object') {
      effectiveOptions = confirmationRetryOrOptions;
    }

    logger.info('[ApiClient] Dispatching postTranscript request:', {
      transcriptLength: transcript.length,
      windowTurns: conversationWindow.length,
      sessionId,
      voiceId: effectiveOptions.voiceId
    });
    // Kill-forensics marks (sessionStorage survives an iOS process kill): the
    // next boot's previous-document-fate line reports whether the fatal
    // document died waiting for THIS response (submitAt set, no
    // submitResponseAt) or after it arrived. A retry attempt re-marks dispatch
    // and clears the prior response/error so the phase always reflects the
    // LAST attempt. Diagnostics only — never throws, never alters control flow.
    markDocTombstone({
      submitAt: new Date().toISOString(),
      submitResponseAt: null,
      submitErrorAt: null,
    });
    try {
      const result = await this.sendTranscriptRequest(
        {
          transcript,
          conversationWindow,
          sessionId,
          currentItemId,
          confirmationRetry,
          simulationMode: effectiveOptions.simulationMode ?? 'standard',
          preferredLanguage: effectiveOptions.preferredLanguage ?? 'en-US',
          testVersion: effectiveOptions.testVersion ?? '2020',
          includeEnglishSimulation: effectiveOptions.includeEnglishSimulation ?? false,
          ...(effectiveOptions.examRunId ? { examRunId: effectiveOptions.examRunId } : {}),
          ...(effectiveOptions.modeGoalResponse ? { modeGoalResponse: true } : {}),
          ...(effectiveOptions.examAction ? { examAction: effectiveOptions.examAction } : {}),
          ...(effectiveOptions.inputMethod ? { inputMethod: effectiveOptions.inputMethod } : {}),
          ...(effectiveOptions.requestId ? { requestId: effectiveOptions.requestId } : {}),
          ...(effectiveOptions.postExamId ? { postExamConversation: true, postExamId: effectiveOptions.postExamId } : {}),
          ...(effectiveOptions.openingResponse ? { openingResponse: true } : {}),
          ...(effectiveOptions.voiceId ? { voiceId: effectiveOptions.voiceId } : {})
        },
        effectiveOptions
      );
      markDocTombstone({ submitResponseAt: new Date().toISOString() });
      return result;
    } catch (error) {
      markDocTombstone({ submitErrorAt: new Date().toISOString() });
      throw error;
    }
  }

  async getMockExamFeedback(examId: string, preferredLanguage: string, signal?: AbortSignal): Promise<MockExamReview> {
    const response = await this.fetchWithAuth('/transcript', {
      method: 'POST',
      signal,
      body: JSON.stringify({ examReview: true, examId, preferredLanguage }),
    });
    const data = await response.json() as Partial<MockExamReview>;
    const feedback = data.feedback;
    if (typeof data.report !== 'string' || !feedback || typeof feedback.summary !== 'string'
      || !Array.isArray(feedback.strengths) || !Array.isArray(feedback.suggestions)
      || (feedback.recommendedMode !== 'practice' && feedback.recommendedMode !== 'study')
      || typeof feedback.recommendationReason !== 'string') {
      throw new ApiError('The exam review response was incomplete.', 500, data);
    }
    return { report: data.report, feedback };
  }

  async postModeTransition(
    sessionId: string,
    currentItemId: string | null,
    options: { headers?: Record<string, string>; voiceId?: string; simulationMode?: SimulationMode; preferredLanguage?: string; testVersion?: TestVersion; includeEnglishSimulation?: boolean } = {}
  ) {
    return this.sendTranscriptRequest({
      modeTransition: true,
      sessionId,
      currentItemId,
      simulationMode: options.simulationMode ?? 'standard',
      preferredLanguage: options.preferredLanguage ?? 'en-US',
      testVersion: options.testVersion ?? '2020',
      includeEnglishSimulation: options.includeEnglishSimulation ?? false,
      ...(options.voiceId ? { voiceId: options.voiceId } : {}),
    }, options);
  }

  /** Select the first interview question without speaking before user input. */
  async postSessionStart(
    sessionId?: string | null,
    options: { headers?: Record<string, string>; voiceId?: string; simulationMode?: SimulationMode; preferredLanguage?: string; testVersion?: TestVersion; includeEnglishSimulation?: boolean; examAction?: MockExamAction } = {}
  ): Promise<{
    responseText: string;
    audioData: ArrayBuffer;
    verdict: 'correct' | 'incorrect' | 'partial' | null;
    needsConfirmation: boolean;
    nextItemId: string | null;
    nextQuestion: string | null;
    assistantSegments: string[];
    examRunId: string | null;
    examCompleted: boolean;
    examReport: string | null;
    examReviewId: string | null;
    examStage: 'none' | 'reading' | 'writing' | 'complete' | null;
  }> {
    logger.info('[ApiClient] Dispatching postSessionStart request:', { sessionId, voiceId: options.voiceId });
    return this.sendTranscriptRequest({
      sessionStart: true,
      sessionId,
      simulationMode: options.simulationMode ?? 'standard',
      preferredLanguage: options.preferredLanguage ?? 'en-US',
      testVersion: options.testVersion ?? '2020',
      includeEnglishSimulation: options.includeEnglishSimulation ?? false,
      ...(options.examAction ? { examAction: options.examAction } : {}),
      ...(options.voiceId ? { voiceId: options.voiceId } : {})
    }, options);
  }

  async postSilenceNudge(
    sessionId: string | null,
    currentItemId: string | null,
    options: { headers?: Record<string, string>; signal?: AbortSignal; voiceId?: string; simulationMode?: SimulationMode; preferredLanguage?: string; testVersion?: TestVersion; includeEnglishSimulation?: boolean } = {}
  ): Promise<{
    responseText: string;
    audioData: ArrayBuffer;
    verdict: 'correct' | 'incorrect' | 'partial' | null;
    needsConfirmation: boolean;
    nextItemId: string | null;
    nextQuestion: string | null;
    assistantSegments: string[];
  }> {
    logger.info('[ApiClient] Dispatching postSilenceNudge request:', { sessionId, currentItemId });
    return this.sendTranscriptRequest({
      silenceNudge: true,
      sessionId,
      currentItemId,
      simulationMode: options.simulationMode ?? 'standard',
      preferredLanguage: options.preferredLanguage ?? 'en-US',
      testVersion: options.testVersion ?? '2020',
      includeEnglishSimulation: options.includeEnglishSimulation ?? false,
      ...(options.voiceId ? { voiceId: options.voiceId } : {}),
    }, options);
  }

  /**
   * On-screen (TEXT ONLY, never spoken) welcome banner, fetched when the app
   * loads — independent of starting a practice session. No audio at all, so
   * this is a dedicated, simpler method rather than sendTranscriptRequest
   * (which requires an audioData string and would incorrectly throw here).
   * @param options.localDate - ISO date string (YYYY-MM-DD) in the user's timezone.
   *   The backend uses this to distinguish a first-visit-today from a same-day
   *   returning visit so the welcome message can be appropriately personalised.
   */
  async fetchWelcomeBanner(options: { headers?: Record<string, string>; localDate?: string } = {}): Promise<{ message: string; isNewUser: boolean }> {
    logger.info('[ApiClient] Dispatching fetchWelcomeBanner request.');
    const response = await this.fetchWithAuth('/transcript', {
      method: 'POST',
      headers: options.headers,
      body: JSON.stringify({
        welcomeBanner: true,
        ...(options.localDate ? { localDate: options.localDate } : {}),
      }),
    });

    const data: unknown = await response.json();
    if (!isRecord(data) || typeof data.responseText !== 'string' || typeof data.isNewUser !== 'boolean') {
      throw new ApiError('Structural Exception: Invalid welcome banner response.', 500, data);
    }
    return { message: data.responseText, isNewUser: data.isNewUser };
  }

  async completeSession(sessionId: string): Promise<{ date: string; reportMarkdown: string }> {
    if (!sessionId) {
      throw new Error('Cannot generate a progress report without a saved session ID.');
    }
    try {
      logger.info(`[ApiClient] Dispatching completeSession for sessionId: ${sessionId}`);
      const fullUrl = this.buildRequestUrl('/complete-session');
      const headersInstance = new Headers();
      headersInstance.set('Authorization', `Bearer ${this.token}`);
      headersInstance.set('Content-Type', 'application/json');

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
          responseShape: summarizePayloadForLog(errorData),
        });
        throw new ApiError('Session completion failed.', res.status, errorData);
      }
      const data: unknown = await res.json();
      if (!isRecord(data)
        || data.success !== true
        || typeof data.date !== 'string'
        || typeof data.reportMarkdown !== 'string') {
        throw new ApiError('Structural Exception: Invalid session completion response.', 500, data);
      }
      return { date: data.date, reportMarkdown: data.reportMarkdown };
    } catch (error) {
      logger.error(`[ApiClient] Failed to dispatch completeSession for ${sessionId}:`, undefined, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
