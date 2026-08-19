/// <reference types="node" />

// amplify/functions/transcript/handler.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import type { WebSocketLikeConstructor } from '@supabase/realtime-js';

const region = process.env.AWS_DEFAULT_REGION || 'us-east-2';
const modelId = process.env.DEFAULT_MODEL_ID || 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const embeddingModelId = process.env.EMBEDDING_MODEL_ID || 'amazon.titan-embed-text-v2:0';

const bedrockClient = new BedrockRuntimeClient({ region });
const pollyClient = new PollyClient({ region });

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
}

interface BedrockResponseShape {
  content?: Array<{ type: 'text'; text: string }>;
}

interface ExtendedSdkStream {
  transformToByteArray(): Promise<Uint8Array>;
}

const USCIS_SYSTEM_PROMPT = `You are a professional, encouraging, and clear USCIS Officer conducting an N-400 Naturalization Civics and History Oral Examination.
Your goals:
1. Evaluate the applicant's oral English comprehension and knowledge of American Civics, History, and Government.
2. Ask clear, direct N-400 civics examination questions (from the official 100 questions pool).
3. Provide concise, constructive feedback when answers are incorrect or incomplete.
4. Keep responses brief, conversational, and direct (max 2-3 sentences per turn) so the user can respond naturally by voice.`;

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
      .select('report_markdown')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentErr) {
      console.warn(`[Lambda-FetchReport] Recent report query error: ${recentErr.message}`);
    }

    if (recentReport?.report_markdown) {
      console.log(`[Lambda-FetchReport] Successfully fetched past report (${recentReport.report_markdown.length} chars)`);
      return recentReport.report_markdown;
    }
  } catch (err) {
    console.error('[Lambda-FetchReport] Exception fetching progress report:', err);
  }

  console.log('[Lambda-FetchReport] No prior report found. Using baseline prompt.');
  return 'No prior progress history available. Begin baseline assessment across American Government, American History, and Integrated Civics.';
}

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

    const rawTranscript = parsedBody.transcript || '';
    const cleanedTranscript = rawTranscript.replace(/\s+/g, ' ').trim();
    const conversationWindow = parsedBody.conversationWindow || [];

    if (!cleanedTranscript) {
      console.log(`[Lambda-Execution] [${traceId}] Empty transcript received. Returning 200 empty payload.`);
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({ responseText: '', audioData: '' })
      };
    }

    console.log(`[Lambda-Execution] [${traceId}] User: "${cleanedTranscript}", Window turns: ${conversationWindow.length}`);

    // 2. Fetch Progress Report
    const progressReportText = await fetchUserProgressReport(userId);
    const fullSystemPrompt = `${USCIS_SYSTEM_PROMPT}\n\nCandidate Active Performance Summary:\n${progressReportText}`;

    // 3. Build Messages Array with Sliding Window & RAG path
    const bedrockMessages: Array<{ role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string }> }> = [];

    if (isRagQuery(cleanedTranscript)) {
      console.log(`[Lambda-RAG] [${traceId}] RAG intent detected for query: "${cleanedTranscript}"`);
      const queryVector = await getTitanEmbedding(cleanedTranscript);

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
          const ragContext = matchedReports
            .map((r: { date: string; report_markdown: string }) => `[Report Date: ${r.date}]\n${r.report_markdown}`)
            .join('\n\n');

          bedrockMessages.push({
            role: 'user',
            content: [{ type: 'text', text: `Historical performance reports:\n${ragContext}` }]
          });
          bedrockMessages.push({
            role: 'assistant',
            content: [{ type: 'text', text: 'Understood. I have reviewed your historical performance reports. How can I help you regarding your progress?' }]
          });
        } else {
          console.log(`[Lambda-RAG] No matching reports above similarity threshold.`);
        }
      }
    } else if (conversationWindow.length > 0) {
      const slicedWindow = conversationWindow.slice(-6);
      console.log(`[Lambda-Window] [${traceId}] Slicing 6-turn conversation window (using ${slicedWindow.length} turns)`);
      for (const turn of slicedWindow) {
        bedrockMessages.push({
          role: turn.role === 'assistant' ? 'assistant' : 'user',
          content: [{ type: 'text', text: turn.content }]
        });
      }
    }

    bedrockMessages.push({
      role: 'user',
      content: [{ type: 'text', text: cleanedTranscript }]
    });

    // 4. Call Bedrock
    console.log(`[Lambda-Bedrock] [${traceId}] Invoking Bedrock modelId="${modelId}" with ${bedrockMessages.length} message turns...`);

    const bedrockRequestPayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 300,
      temperature: 0.5,
      system: fullSystemPrompt,
      messages: bedrockMessages
    };

    const bedrockCommand = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(bedrockRequestPayload)
    });

    const bedrockResponse = await bedrockClient.send(bedrockCommand);
    const bedrockResponseBodyString = Buffer.from(bedrockResponse.body).toString('utf-8');
    const parsedBedrockData = JSON.parse(bedrockResponseBodyString) as BedrockResponseShape;
    const generatedAssistantText = parsedBedrockData.content?.[0]?.text?.trim() || '';

    if (!generatedAssistantText) {
      console.error(`[Lambda-Bedrock-Error] [${traceId}] Empty text returned from Bedrock:`, bedrockResponseBodyString);
      throw new Error('Inference Exception: Empty text returned from Bedrock.');
    }

    console.log(`[Lambda-Bedrock-Success] [${traceId}] Assistant: "${generatedAssistantText}"`);

    // 5. Polly Speech Synthesis
    console.log(`[Lambda-Polly] [${traceId}] Synthesizing speech with voice Joanna...`);
    const pollyCommand = new SynthesizeSpeechCommand({
      OutputFormat: 'mp3',
      Text: generatedAssistantText,
      VoiceId: 'Joanna',
      Engine: 'neural'
    });

    const pollyResponse = await pollyClient.send(pollyCommand);

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
        audioData: base64AudioData
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
