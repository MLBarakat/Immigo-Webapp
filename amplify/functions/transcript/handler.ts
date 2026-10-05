import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import type { WebSocketLikeConstructor } from '@supabase/realtime-js';
import { getItem, selectNextQuestion } from './turn/bank';
import { TurnInterpreterAdapter, bedrockComplete } from './turn/turn-interpreter';
import { resolveTurn } from './turn/turn-policy';

const region = process.env.AWS_DEFAULT_REGION || 'us-east-2';
const pollyRegion = process.env.POLLY_REGION || 'us-east-1';
const modelId = process.env.DEFAULT_MODEL_ID || 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const embeddingModelId = process.env.EMBEDDING_MODEL_ID || 'amazon.titan-embed-text-v2:0';

// Clients must be created BEFORE anything that uses them (const is not hoisted).
const bedrockClient = new BedrockRuntimeClient({ region });
const pollyClient = new PollyClient({ region: pollyRegion });

// One shared model transport, reused by the interpreter and the assist path.
const modelComplete = bedrockComplete(bedrockClient, modelId);
const turnInterpreter = new TurnInterpreterAdapter(modelComplete);

let supabaseClient: SupabaseClient | null = null;

const LambdaUnsupportedRealtimeTransport: WebSocketLikeConstructor = class {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readonly readyState = 3;
  readonly url: string;
  readonly protocol = '';
  readonly bufferedAmount = 0;

  binaryType?: string;
  onopen: ((this: unknown, ev: Event) => unknown) | null = null;
  onmessage: ((this: unknown, ev: MessageEvent) => unknown) | null = null;
  onclose: ((this: unknown, ev: CloseEvent) => unknown) | null = null;
  onerror: ((this: unknown, ev: Event) => unknown) | null = null;

  constructor(address: string | URL, _subprotocols?: string | string[]) {
    this.url = address.toString();
  }

  close(): void { }

  send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    throw new Error('Supabase Realtime is not available in the Lambda runtime.');
  }

  addEventListener(_type: string, _listener: EventListener): void { }

  removeEventListener(_type: string, _listener: EventListener): void { }
};

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  transcript?: string;
  conversationWindow?: ConversationTurn[];
  sessionId?: string;
  currentItemId?: string;
  confirmationRetry?: boolean;
  /**
   * True for a proactive, client-initiated session-start call (item 6): fired
   * automatically the moment a session begins, before any user speech, so the
   * greeting can speak first instead of waiting for a garbled first utterance
   * to trigger it implicitly.
   */
  sessionStart?: boolean;
  /**
   * True for the on-screen (TEXT ONLY, never spoken) welcome banner fetched
   * when the app loads, independent of starting a practice session. Returns
   * early with no Polly synthesis at all.
   */
  welcomeBanner?: boolean;
}

interface ExtendedSdkStream {
  transformToByteArray(): Promise<Uint8Array>;
}

const RAG_INTENT_KEYWORDS = [
  'how have i improved', 'my score', 'my progress', 'last week',
  'last month', 'how am i doing', 'my history', 'my weaknesses',
  'areas to improve', 'government score', 'civics score', 'history score'
];

function isRagQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return RAG_INTENT_KEYWORDS.some(kw => lower.includes(kw));
}

function getCaseInsensitiveHeader(headers: Record<string, string | undefined>, targetKey: string): string | undefined {
  const normalizedTarget = targetKey.toLowerCase();
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === normalizedTarget) {
      return headers[keys[i]];
    }
  }
  return undefined;
}

function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase runtime configuration is missing. Configure SUPABASE_URL and SUPABASE_ANON_KEY for the Amplify backend environment.');
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    realtime: {
      transport: LambdaUnsupportedRealtimeTransport,
    },
  });
  return supabaseClient;
}

async function fetchUserProgressReport(userId: string): Promise<string> {
  const supabase = getSupabaseClient();
  const today = new Date().toISOString().split('T')[0];
  try {
    console.log(`[Lambda-FetchReport] Querying daily_progress_reports for user=${userId}, date=${today}`);
    const { data: todayReport, error: todayErr } = await supabase
      .from('daily_progress_reports')
      .select('report_markdown')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (todayErr) {
      console.warn(`[Lambda-FetchReport] Today report query error: ${todayErr.message}`);
    }

    if (todayReport?.report_markdown) {
      console.log(`[Lambda-FetchReport] Successfully fetched today's living report (${todayReport.report_markdown.length} chars)`);
      return todayReport.report_markdown;
    }

    console.log(`[Lambda-FetchReport] Today's report not found. Querying most recent past report...`);
    const { data: recentReport, error: recentErr } = await supabase
      .from('daily_progress_reports')
      .select('report_markdown, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentErr) {
      console.warn(`[Lambda-FetchReport] Recent report query error: ${recentErr.message}`);
    }

    if (recentReport?.report_markdown) {
      console.log(`[Lambda-FetchReport] Successfully fetched past report from ${recentReport.date} (${recentReport.report_markdown.length} chars)`);
      return recentReport.report_markdown;
    }
  } catch (err) {
    console.error('[Lambda-FetchReport] Exception fetching progress report:', err);
  }

  console.log('[Lambda-FetchReport] No prior report found. Using baseline prompt.');
  return 'No prior progress history available. Begin baseline assessment across American Government, American History, and Integrated Civics.';
}

// NOTE: the spoken, in-session personalized greeting (isFirstSessionOfDay /
// getDaysSinceLastSession / generateSessionGreeting, driving buildGreetingPrompt
// in turn-interpreter.ts) was removed here — that narrative content now lives
// in the separate, TEXT-ONLY welcomeBanner path above, fetched on app load
// rather than spoken at session start. buildGreetingPrompt/generateGreeting
// remain intact and tested in turn-interpreter.ts if ever needed again; they
// are simply not called from this handler anymore.

async function getTitanEmbedding(text: string): Promise<number[] | null> {
  try {
    console.log(`[Lambda-Embedding] Generating Titan v2 embedding for text length ${text.length}...`);
    const command = new InvokeModelCommand({
      modelId: embeddingModelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputText: text,
        dimensions: 1024,
        normalize: true
      })
    });
    const response = await bedrockClient.send(command);
    const bodyStr = Buffer.from(response.body).toString('utf-8');
    const parsed = JSON.parse(bodyStr);
    const embedding = parsed.embedding || null;
    console.log(`[Lambda-Embedding] Successfully generated embedding (${embedding?.length || 0} dims)`);
    return embedding;
  } catch (err) {
    console.error('[Lambda-Embedding] Exception generating Titan v2 embedding:', err);
    return null;
  }
}

/**
 * Grounded progress answer for "how am I doing?" style questions.
 * Retrieves the user's report context (vector match, with a baseline fallback)
 * and answers ONLY from it.
 */
async function answerProgressQuery(userId: string, question: string, traceId: string): Promise<string> {
  const supabase = getSupabaseClient();
  let ragContext = '';

  const queryVector = await getTitanEmbedding(question);
  if (queryVector) {
    console.log(`[Lambda-RAG] [${traceId}] Querying match_progress_reports RPC...`);
    const { data: matchedReports, error: rpcError } = await supabase.rpc('match_progress_reports', {
      query_embedding: queryVector,
      match_threshold: 0.3,
      match_count: 3,
      p_user_id: userId
    });

    if (rpcError) {
      console.error(`[Lambda-RAG] RPC Error: ${rpcError.message}`);
    } else if (matchedReports && matchedReports.length > 0) {
      console.log(`[Lambda-RAG] Found ${matchedReports.length} matching progress report sections.`);
      ragContext = matchedReports
        .map((r: { date: string; report_markdown: string }) => `[Report Date: ${r.date}]\n${r.report_markdown}`)
        .join('\n\n');
    } else {
      console.log(`[Lambda-RAG] No matching reports above similarity threshold.`);
    }
  }

  if (!ragContext) {
    ragContext = await fetchUserProgressReport(userId);
  }

  return turnInterpreter.answerProgressQuery(ragContext, question);
}

/**
 * Build a Supabase client authorized AS THE USER (their JWT), so RLS resolves
 * auth.uid() to this user. Used for writing the graded turn under RLS.
 */
function getUserScopedSupabase(token: string): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase runtime configuration is missing.');
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    realtime: { transport: LambdaUnsupportedRealtimeTransport },
  });
}

/**
 * Persist a server-graded answer (server-authoritative: the client cannot fake
 * the verdict). RLS scopes the row to the authenticated user. Failures are
 * logged but never break the turn.
 */
async function persistGradedAnswer(
  token: string,
  userId: string,
  sessionId: string | null,
  itemId: string,
  verdict: 'correct' | 'incorrect' | 'partial',
  traceId: string
): Promise<void> {
  try {
    const db = getUserScopedSupabase(token);
    const { error } = await db.from('graded_answers').insert({
      user_id: userId,
      session_id: sessionId,
      item_id: itemId,
      verdict,
    });
    if (error) {
      console.warn(`[Lambda-Grade] [${traceId}] persist error: ${error.message}`);
    } else {
      console.log(`[Lambda-Grade] [${traceId}] persisted item=${itemId} verdict=${verdict}`);
    }
  } catch (err) {
    console.error(`[Lambda-Grade] [${traceId}] persist exception:`, err);
  }
}

/**
 * Recently-asked item ids for THIS session, read from graded_answers (RLS-
 * scoped to the caller via their own JWT — same pattern as persistGradedAnswer).
 * Fed into selectNextQuestion's exclusion list so a short session doesn't
 * coincidentally re-ask a question from a few turns earlier. Every item that
 * gets advanced past is guaranteed to have a graded_answers row (persisted
 * right before advancing), so this is a complete record of what's already
 * been asked in the session — not just the single most recent item.
 * Read failures degrade gracefully to an empty list (falls back to the old
 * single-item exclusion) rather than breaking the turn.
 */
async function getRecentSessionItemIds(
  token: string,
  sessionId: string | null | undefined,
  traceId: string,
  limit = 20
): Promise<string[]> {
  if (!sessionId) return [];
  try {
    const db = getUserScopedSupabase(token);
    const { data, error } = await db
      .from('graded_answers')
      .select('item_id')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn(`[Lambda-Grade] [${traceId}] recent-items query error: ${error.message}`);
      return [];
    }
    return (data ?? []).map((row) => row.item_id as string);
  } catch (err) {
    console.error(`[Lambda-Grade] [${traceId}] recent-items query exception:`, err);
    return [];
  }
}

/**
 * Lifetime stats across ALL of the user's sessions (not just one), for the
 * welcome banner's "summary of achievement so far". Same RLS-scoped pattern
 * as getRecentSessionItemIds. A zero-answered result IS the "new user" signal
 * — no separate existence check needed.
 */
async function getLifetimeStats(
  token: string,
  traceId: string,
  recentMissedLimit = 3
): Promise<{ answered: number; correct: number; accuracyPct: number; recentlyMissedQuestions: string[] }> {
  try {
    const db = getUserScopedSupabase(token);
    const { data, error } = await db
      .from('graded_answers')
      .select('item_id, verdict, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn(`[Lambda-WelcomeBanner] [${traceId}] lifetime-stats query error: ${error.message}`);
      return { answered: 0, correct: 0, accuracyPct: 0, recentlyMissedQuestions: [] };
    }

    const rows = (data ?? []) as Array<{ item_id: string; verdict: string }>;
    const answered = rows.length;
    const correct = rows.filter((r) => r.verdict === 'correct').length;
    const accuracyPct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    const recentlyMissedQuestions = rows
      .filter((r) => r.verdict !== 'correct')
      .slice(0, recentMissedLimit)
      .map((r) => getItem(r.item_id)?.question)
      .filter((q): q is string => Boolean(q));

    return { answered, correct, accuracyPct, recentlyMissedQuestions };
  } catch (err) {
    console.error(`[Lambda-WelcomeBanner] [${traceId}] lifetime-stats exception:`, err);
    return { answered: 0, correct: 0, accuracyPct: 0, recentlyMissedQuestions: [] };
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const traceId = getCaseInsensitiveHeader(event.headers || {}, 'x-correlation-trace-id') || `lambda-trace-${Date.now()}`;

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key,x-correlation-trace-id',
    'x-correlation-trace-id': traceId
  };

  console.log(`[Lambda-Execution-Start] [${traceId}] Method: ${event.httpMethod}, Path: ${event.path}`);

  try {
    // 0. JWT Authentication Guard
    const authHeader = getCaseInsensitiveHeader(event.headers || {}, 'authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn(`[Lambda-Auth-Warning] [${traceId}] Missing or invalid Authorization header.`);
      return {
        statusCode: 401,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Unauthorized: Missing or invalid Bearer token.' })
      };
    }

    const token = authHeader.replace('Bearer ', '').trim();
    console.log(`[Lambda-Auth] [${traceId}] Validating JWT token with Supabase Auth...`);
    const supabase = getSupabaseClient();
    const { data: userData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !userData?.user) {
      console.error(`[Lambda-Auth-Error] [${traceId}] Supabase auth validation failed:`, authError?.message);
      return {
        statusCode: 401,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Unauthorized: Invalid authentication token.' })
      };
    }

    const userId = userData.user.id;
    console.log(`[Lambda-Auth-Success] [${traceId}] Authenticated User ID: ${userId}`);

    // 1. Inbound Guard
    if (!event.body) {
      console.warn(`[Lambda-Payload-Warning] [${traceId}] Empty request body.`);
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Payload Exception: Missing inbound JSON body.' })
      };
    }

    let parsedBody: RequestBody;
    try {
      parsedBody = JSON.parse(event.body) as RequestBody;
    } catch (jsonErr) {
      console.error(`[Lambda-Payload-Error] [${traceId}] Failed to parse JSON body:`, jsonErr);
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Malformed JSON Exception: Failed to parse request body.' })
      };
    }

    // ---- On-screen welcome banner (TEXT ONLY, never spoken) ----
    // Fetched when the app loads, independent of starting a practice session.
    // Returns early, before the transcript guard or any Polly synthesis —
    // this call has no transcript and produces no audio at all.
    if (parsedBody.welcomeBanner === true) {
      const lifetime = await getLifetimeStats(token, traceId);
      const isNewUser = lifetime.answered === 0;
      const message = await turnInterpreter.generateWelcomeBanner(
        isNewUser
          ? { isNewUser: true }
          : {
              isNewUser: false,
              lifetimeStats: {
                answered: lifetime.answered,
                correct: lifetime.correct,
                accuracyPct: lifetime.accuracyPct,
                recentlyMissedQuestions: lifetime.recentlyMissedQuestions,
              },
            }
      );
      console.log(`[Lambda-WelcomeBanner] [${traceId}] isNewUser=${isNewUser}, lifetimeAnswered=${lifetime.answered}`);
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({ responseText: message, isNewUser }),
      };
    }

    const rawTranscript = parsedBody.transcript || '';
    const cleanedTranscript = rawTranscript.replace(/\s+/g, ' ').trim();

    // Denial-of-wallet & token bloat guard (SEC-01): reject oversized transcripts
    if (cleanedTranscript.length > 1000) {
      console.warn(`[Lambda-Payload-Warning] [${traceId}] Transcript exceeded character limit: ${cleanedTranscript.length} chars.`);
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Payload Exception: Transcript exceeds maximum allowed length of 1,000 characters.' })
      };
    }

    // A proactive session-start call (item 6) legitimately has no transcript —
    // only the empty-guard for a REAL turn with nothing to process should fire.
    if (!cleanedTranscript && parsedBody.sessionStart !== true) {
      console.log(`[Lambda-Execution] [${traceId}] Empty transcript received. Returning 200 empty payload.`);
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({ responseText: '', audioData: '' })
      };
    }

    console.log(`[Lambda-Execution] [${traceId}] User: "${cleanedTranscript}", currentItemId: ${parsedBody.currentItemId ?? '(none)'}`);

    // 2. Route the turn.
    let generatedAssistantText = '';
    let verdict: 'correct' | 'incorrect' | 'partial' | null = null;
    let needsConfirmation = false;
    let nextItemId: string;
    let nextQuestionText: string;

    const askedItem = getItem(parsedBody.currentItemId);

    if (parsedBody.sessionStart === true) {
      // ---- EXPLICIT session start (item 6): fires proactively before any
      // real user speech, so the first question is established and spoken
      // immediately. The personalized narrative welcome now lives in the
      // separate, text-only welcomeBanner path above — this just needs to
      // pick + announce the first question, so no LLM call is needed here
      // at all (faster and one less thing that can fail). ----
      console.log(`[Lambda-Start] [${traceId}] Explicit sessionStart; picking first question (no narrative LLM call).`);
      const first = selectNextQuestion();
      generatedAssistantText = `Let's begin. ${first.question}`;
      nextItemId = first.id;
      nextQuestionText = first.question;

    } else if (cleanedTranscript && isRagQuery(cleanedTranscript)) {
      // ---- ASSIST / progress path (grounded in the user's own reports) ----
      console.log(`[Lambda-RAG] [${traceId}] Progress intent detected.`);
      generatedAssistantText = await answerProgressQuery(userId, cleanedTranscript, traceId);
      // Do NOT advance the civics question; keep the user's place.
      const stay = askedItem ?? selectNextQuestion();
      nextItemId = stay.id;
      nextQuestionText = stay.question;

    } else if (!askedItem) {
      // ---- Legacy/fallback START path: no active question and no explicit
      // sessionStart flag (e.g. an older client). Kept as a safety net so the
      // app still works even if the client never calls sessionStart — same
      // simplified behavior (no LLM call) as the explicit sessionStart path. ----
      console.log(`[Lambda-Start] [${traceId}] No active question (implicit); picking first question.`);
      const first = selectNextQuestion();
      generatedAssistantText = `Let's begin. ${first.question}`;
      nextItemId = first.id;
      nextQuestionText = first.question;

    } else {
      // ---- GRADING path (grounded: server owns the asked item) ----
      const interp = await turnInterpreter.interpret(
        { askedItem, preferredLanguage: undefined /* wire from profile later */ },
        cleanedTranscript
      );

      // CODE decides the outcome; the AI only proposed it. `rawTranscript` here
      // is deliberately `cleanedTranscript` (this turn's actual words), passed
      // explicitly (NOT via `{ rawTranscript }` shorthand) so it can never be
      // confused with the outer, uncleaned `rawTranscript` variable above.
      const outcome = resolveTurn(interp, {
        askedItem,
        isConfirmationRetry: parsedBody.confirmationRetry === true,
        rawTranscript: cleanedTranscript,
      });
      verdict = outcome.committedVerdict;

      if (outcome.flags.includes('manipulation_detected')) {
        console.warn(`[Lambda-Security] [${traceId}] manipulation attempt contained`);
      }

      // THE FIX: advance to a new question ONLY when a FINAL grade was
      // actually committed. Every non-advancing outcome — clarify, teach,
      // assist, affirm, redirect, repeat, hint, or an in-progress near-miss/
      // multi-part follow-up — stays on the SAME question. Previously this
      // branched on `replyKind === 'needs_confirmation'` specifically, which
      // meant EVERY other non-grading reply (e.g. "I'm not sure what you
      // mean" -> unclear) still bulldozed forward into an unrelated question.
      if (!outcome.advanceQuestion) {
        // `needsConfirmation` is the CLIENT-facing retry flag: only near-miss
        // confirmation and in-progress multi-part answers need the client to
        // remember to send confirmationRetry=true next turn (turn-policy sets
        // replyKind='needs_confirmation' for exactly those two cases). Other
        // stay reasons (explain/assist/manipulation/off_topic/unclear/repeat/
        // hint) don't need any retry bookkeeping — the next turn is simply a
        // fresh attempt at the same still-current question.
        needsConfirmation = outcome.replyKind === 'needs_confirmation';
        generatedAssistantText = outcome.useModelReply
          ? (interp?.reply || outcome.safeReply)
          : outcome.safeReply;
        nextItemId = askedItem.id;            // stay on the same question
        nextQuestionText = askedItem.question;
        console.log(`[Lambda-Grade] [${traceId}] not advancing (intent=${outcome.effectiveIntent}, replyKind=${outcome.replyKind}, needsConfirmation=${needsConfirmation})`);
      } else {
        // Persist the graded turn (server-authoritative, RLS-scoped as the user).
        if (outcome.scoreChanged && outcome.committedVerdict) {
          await persistGradedAnswer(
            token,
            userId,
            parsedBody.sessionId ?? null,
            askedItem.id,
            outcome.committedVerdict,
            traceId
          );
        }

        const feedback = outcome.useModelReply
          ? (interp?.reply || outcome.safeReply)
          : outcome.safeReply;

        // Advance to the next question, avoiding not just the one just asked
        // but everything asked so far this session (up to a bound) — the
        // persist above already wrote askedItem.id, so it's included here too.
        const recentItemIds = await getRecentSessionItemIds(token, parsedBody.sessionId, traceId);
        const excludeIds = recentItemIds.length > 0 ? recentItemIds : [askedItem.id];
        const next = selectNextQuestion(excludeIds);
        nextItemId = next.id;
        nextQuestionText = next.question;

        // Speak the feedback AND the next question so the voice loop keeps flowing.
        generatedAssistantText = `${feedback} Next question: ${next.question}`;
      }
    }

    if (!generatedAssistantText) {
      generatedAssistantText = "Let's keep going.";
    }

    // 3. Polly Speech Synthesis
    console.log(`[Lambda-Polly] [${traceId}] Synthesizing speech with voice Joanna (region: ${pollyRegion})...`);
    let pollyResponse;
    try {
      const pollyCommand = new SynthesizeSpeechCommand({
        OutputFormat: 'mp3',
        Text: generatedAssistantText,
        VoiceId: 'Joanna',
        Engine: 'neural'
      });

      pollyResponse = await pollyClient.send(pollyCommand);
    } catch (pollyErr: unknown) {
      const pollyErrMsg = pollyErr instanceof Error ? pollyErr.message : String(pollyErr);
      if (pollyErrMsg.includes('not supported in this region') || pollyErrMsg.includes('UnsupportedFeatureException')) {
        console.warn(`[Lambda-Polly-Warn] [${traceId}] Neural engine unsupported; falling back to standard engine.`);
        const fallbackCommand = new SynthesizeSpeechCommand({
          OutputFormat: 'mp3',
          Text: generatedAssistantText,
          VoiceId: 'Joanna',
          Engine: 'standard'
        });
        pollyResponse = await pollyClient.send(fallbackCommand);
      } else {
        throw pollyErr;
      }
    }

    if (!pollyResponse.AudioStream) {
      console.error(`[Lambda-Polly-Error] [${traceId}] Empty AudioStream from Polly.`);
      throw new Error('Synthesis Exception: Empty Polly audio stream.');
    }

    const verifiableSdkStream = pollyResponse.AudioStream as unknown as ExtendedSdkStream;
    const audioUint8Array = await verifiableSdkStream.transformToByteArray();
    const base64AudioData = Buffer.from(audioUint8Array).toString('base64');
    console.log(`[Lambda-Polly-Success] [${traceId}] Synthesized audio payload (${base64AudioData.length} base64 chars).`);

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        responseText: generatedAssistantText,
        audioData: base64AudioData,
        verdict,
        needsConfirmation,
        nextItemId,
        nextQuestion: nextQuestionText
      })
    };

  } catch (error: unknown) {
    const parsedMessage = error instanceof Error ? error.message : 'Unhandled exception in transcript Lambda.';
    const errorStack = error instanceof Error ? error.stack : String(error);
    console.error(`[Lambda-Exception-Unhandled] [${traceId}] Error: ${parsedMessage}\nStack: ${errorStack}`);

    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({
        error: `Serverless Failure: ${parsedMessage}`,
        traceId
      })
    };
  }
};