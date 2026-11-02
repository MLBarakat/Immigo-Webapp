/// <reference types="node" />

// amplify/functions/aggregateSession/handler.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import type { WebSocketLikeConstructor } from '@supabase/realtime-js';
import bank from '../transcript/civics-bank.2020-128.json';
import bank2008 from '../transcript/civics-bank.2008-100.json';
import {
  buildDailyProgressReport,
  DAILY_REPORT_SYSTEM_PROMPT,
  DAILY_REPORT_PROMPT_VERSION,
  getQualitativeReportContext,
} from './reportFormat';

const region = process.env.AWS_DEFAULT_REGION || 'us-east-2';
const modelId = process.env.DEFAULT_MODEL_ID || 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const embeddingModelId = process.env.EMBEDDING_MODEL_ID || 'amazon.titan-embed-text-v2:0';

const bedrockClient = new BedrockRuntimeClient({ region });

let supabaseClient: SupabaseClient | null = null;

const bankItems = (bank as { items: Array<{ id: string; question: string }> }).items;
const bank2008Items = (bank2008 as { items: Array<{ id: string; question: string }> }).items;
const bankById = new Map([
  ...bankItems.map((i) => [`2020:${i.id}`, i] as const),
  ...bank2008Items.map((i) => [`2008:${i.id}`, i] as const),
]);

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

interface RequestBody {
  sessionId?: string;
}

interface BedrockResponseShape {
  content?: Array<{ type: 'text'; text: string }>;
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

async function getTitanEmbedding(text: string): Promise<number[] | null> {
  try {
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
    return parsed.embedding || null;
  } catch (err) {
    console.error('[Aggregator-Embedding] Error generating Titan v2 embedding:', err);
    return null;
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const traceId = getCaseInsensitiveHeader(event.headers || {}, 'x-correlation-trace-id') || `agg-trace-${Date.now()}`;

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key,x-correlation-trace-id',
    'x-correlation-trace-id': traceId
  };

  try {
    // 0. JWT Authentication Guard
    const authHeader = getCaseInsensitiveHeader(event.headers || {}, 'authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Unauthorized: Missing token.' })
      };
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const supabase = getSupabaseClient();
    const { data: userData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !userData?.user) {
      return {
        statusCode: 401,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Unauthorized: Invalid token.' })
      };
    }

    const userId = userData.user.id;

    if (!event.body) {
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Missing request body.' })
      };
    }

    let parsedBody: RequestBody;
    try {
      parsedBody = JSON.parse(event.body) as RequestBody;
    } catch {
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Invalid JSON body.' })
      };
    }

    const sessionId = parsedBody.sessionId;
    if (!sessionId || typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) {
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Payload Exception: Invalid or malformed sessionId.' })
      };
    }

    console.log(`[Aggregator-Execution] [${traceId}] Processing session aggregation for session: ${sessionId}, user: ${userId}`);

    const db = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }, realtime: { transport: LambdaUnsupportedRealtimeTransport } }
    );
    const { data: sessionRow } = await db.from('sessions').select('local_date').eq('id', sessionId).eq('user_id', userId).maybeSingle();
    const today = sessionRow?.local_date ?? new Date().toISOString().split('T')[0];

    // The local-date session row is the source of truth for today's accumulated
    // conversation across devices and across all three learning modes.
    const { data: sessionMessages, error: msgError } = await db
      .from('messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (msgError) {
      throw new Error(`Failed to load session messages: ${msgError.message}`);
    }

    const sessionTranscript = (sessionMessages ?? [])
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    // 2. Fetch the previous day's report for context, not today's report that
    // this invocation is about to replace.
    let previousReportMarkdown = 'No previous progress report recorded.';

    const { data: latestReport } = await db
      .from('daily_progress_reports')
      .select('report_markdown')
      .eq('user_id', userId)
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestReport?.report_markdown) {
      previousReportMarkdown = latestReport.report_markdown;
    }

    // 2b. Fetch authoritative per-answer verdicts for this account-local session.
    const { data: gradedRows, error: gradedErr } = await db
      .from('graded_answers')
      .select('item_id, verdict, created_at, simulation_mode, test_version')
      .eq('user_id', userId)
      .eq('session_id', sessionId);

    if (gradedErr) {
      console.warn(`[Aggregator-Grade] [${traceId}] graded_answers query error: ${gradedErr.message}`);
    }

    const graded = (gradedRows ?? []) as Array<{ item_id: string; verdict: string; simulation_mode?: string; test_version?: string }>;
    if (sessionTranscript.length === 0 && graded.length === 0) {
      console.log(`[Aggregator-Execution] No messages or graded answers found for session ${sessionId}. Skipping aggregation.`);
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({ success: true, date: today, reportMarkdown: '' })
      };
    }

    const answered = graded.length;
    const correct = graded.filter((g) => g.verdict === 'correct').length;
    const partial = graded.filter((g) => g.verdict === 'partial').length;
    const incorrect = graded.filter((g) => g.verdict === 'incorrect').length;
    const accuracyPct = answered > 0 ? Math.round((correct / answered) * 100) : 0;

    const missed = graded
      .filter((g) => g.verdict !== 'correct')
      .map((g) => {
        const version = g.test_version === '2008' ? '2008' : '2020';
        return `  * (${version}:${g.item_id}) ${bankById.get(`${version}:${g.item_id}`)?.question ?? g.item_id}`;
      });

    const modeBreakdown = [...new Set(graded.map((g) => g.simulation_mode ?? 'standard'))].map((mode) => {
      const rows = graded.filter((g) => (g.simulation_mode ?? 'standard') === mode);
      const modeCorrect = rows.filter((g) => g.verdict === 'correct').length;
      return `- ${mode}: ${modeCorrect}/${rows.length} correct (${Math.round(modeCorrect * 100 / rows.length)}%)`;
    });

    console.log(`[Aggregator-Grade] [${traceId}] answered=${answered} correct=${correct} partial=${partial} incorrect=${incorrect} accuracy=${accuracyPct}%`);

    // 3. Build Bedrock Evaluation Prompt
    const previousQualitativeContext = getQualitativeReportContext(previousReportMarkdown);

    const bedrockEvaluationPayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 800,
      temperature: 0.3,
      system: DAILY_REPORT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Previous qualitative report context:\n${previousQualitativeContext || 'No previous qualitative notes are available.'}\n\nToday's Conversation Transcript:\n${sessionTranscript}\n\nPlease write qualitative observations for the account-local calendar date ${today}. Do not repeat scores, ratings, percentages, counts, or category breakdowns; the server adds recorded results separately.`
            }
          ]
        }
      ]
    };

    const bedrockCommand = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(bedrockEvaluationPayload)
    });

    console.log(`[Aggregator-Model] [${traceId}] model=${modelId} promptVersion=${DAILY_REPORT_PROMPT_VERSION}`);
    const bedrockResponse = await bedrockClient.send(bedrockCommand);
    const bodyString = Buffer.from(bedrockResponse.body).toString('utf-8');
    const parsedData = JSON.parse(bodyString) as BedrockResponseShape;
    const rawReportMarkdown = parsedData.content?.[0]?.text?.trim() || '';

    const reportMarkdown = buildDailyProgressReport(rawReportMarkdown, {
      answered,
      correct,
      partial,
      incorrect,
      accuracyPct,
      modeBreakdown,
      missedQuestions: missed,
    });

    console.log(`[Aggregator-Execution] Generated progress report (${reportMarkdown.length} chars)`);

    // 4. Generate Embedding Vector using Titan v2
    const embeddingVector = await getTitanEmbedding(reportMarkdown);

    // 5. UPSERT into daily_progress_reports (on conflict user_id, date)
    const { error: upsertError } = await db
      .from('daily_progress_reports')
      .upsert(
        {
          user_id: userId,
          date: today,
          report_markdown: reportMarkdown,
          embedding: embeddingVector,
        },
        { onConflict: 'user_id,date' }
      );

    if (upsertError) {
      console.error(`[Aggregator-Execution] UPSERT error: ${upsertError.message}`);
      throw new Error(`Failed to upsert progress report: ${upsertError.message}`);
    }

    console.log(`[Aggregator-Execution] Successfully upserted daily progress report for date ${today}, user ${userId}`);

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ success: true, date: today, reportMarkdown })
    };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unhandled exception in aggregator Lambda.';
    console.error(`[Aggregator-Exception] [${traceId}] Failure: ${message}`);

    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: `Aggregator Failure: ${message}`, traceId })
    };
  }
};
