/// <reference types="node" />

// amplify/functions/transcript/handler.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { createClient } from '@supabase/supabase-js';

const region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const modelId = process.env.DEFAULT_MODEL_ID || 'anthropic.claude-haiku-4-5';
const embeddingModelId = process.env.EMBEDDING_MODEL_ID || 'amazon.titan-embed-text-v2:0';

const bedrockClient = new BedrockRuntimeClient({ region });
const pollyClient = new PollyClient({ region });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

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

async function fetchUserProgressReport(userId: string): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  try {
    // 1. Try today's living report
    const { data: todayReport } = await supabaseClient
      .from('daily_progress_reports')
      .select('report_markdown')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (todayReport?.report_markdown) {
      return todayReport.report_markdown;
    }

    // 2. Fall back to most recent report
    const { data: recentReport } = await supabaseClient
      .from('daily_progress_reports')
      .select('report_markdown')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentReport?.report_markdown) {
      return recentReport.report_markdown;
    }
  } catch (err) {
    console.error('[Lambda-FetchReport] Error fetching progress report:', err);
  }

  return 'No prior progress history available. Begin baseline assessment across American Government, American History, and Integrated Civics.';
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
    console.error('[Lambda-Embedding] Error generating Titan v2 embedding:', err);
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

  try {
    // 0. JWT Authentication Guard
    const authHeader = getCaseInsensitiveHeader(event.headers || {}, 'authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Unauthorized: Missing or invalid Bearer token.' })
      };
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: userData, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !userData?.user) {
      return {
        statusCode: 401,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Unauthorized: Invalid authentication token.' })
      };
    }

    const userId = userData.user.id;

    // 1. Inbound Guard
    if (!event.body) {
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Payload Exception: Missing inbound JSON body.' })
      };
    }

    let parsedBody: RequestBody;
    try {
      parsedBody = JSON.parse(event.body) as RequestBody;
    } catch {
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
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({ responseText: '', audioData: '' })
      };
    }

    console.log(`[Lambda-Execution] [${traceId}] User [${userId}] Text: "${cleanedTranscript}"`);

    // 2. Fetch Progress Report
    const progressReportText = await fetchUserProgressReport(userId);
    const fullSystemPrompt = `${USCIS_SYSTEM_PROMPT}\n\nCandidate Active Performance Summary:\n${progressReportText}`;

    // 3. Build Messages Array with Sliding Window & RAG path
    const bedrockMessages: Array<{ role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string }> }> = [];

    if (isRagQuery(cleanedTranscript)) {
      console.log(`[Lambda-RAG] [${traceId}] RAG intent detected for query: "${cleanedTranscript}"`);
      const queryVector = await getTitanEmbedding(cleanedTranscript);

      if (queryVector) {
        const { data: matchedReports, error: rpcError } = await supabaseClient.rpc('match_progress_reports', {
          query_embedding: queryVector,
          match_threshold: 0.3,
          match_count: 3,
          p_user_id: userId
        });

        if (rpcError) {
          console.error(`[Lambda-RAG] RPC Error: ${rpcError.message}`);
        } else if (matchedReports && matchedReports.length > 0) {
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
        }
      }
    } else if (conversationWindow.length > 0) {
      // Append last 6 sliding window turns
      const slicedWindow = conversationWindow.slice(-6);
      for (const turn of slicedWindow) {
        bedrockMessages.push({
          role: turn.role === 'assistant' ? 'assistant' : 'user',
          content: [{ type: 'text', text: turn.content }]
        });
      }
    }

    // Append current user utterance as the final turn
    bedrockMessages.push({
      role: 'user',
      content: [{ type: 'text', text: cleanedTranscript }]
    });

    // 4. Call Bedrock
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
      throw new Error('Inference Exception: Empty text returned from Bedrock.');
    }

    console.log(`[Lambda-Execution] [${traceId}] Bedrock response: "${generatedAssistantText}"`);

    // 5. Polly Speech Synthesis
    const pollyCommand = new SynthesizeSpeechCommand({
      OutputFormat: 'mp3',
      Text: generatedAssistantText,
      VoiceId: 'Joanna',
      Engine: 'neural'
    });

    const pollyResponse = await pollyClient.send(pollyCommand);

    if (!pollyResponse.AudioStream) {
      throw new Error('Synthesis Exception: Empty Polly audio stream.');
    }

    const verifiableSdkStream = pollyResponse.AudioStream as unknown as ExtendedSdkStream;
    const audioUint8Array = await verifiableSdkStream.transformToByteArray();
    const base64AudioData = Buffer.from(audioUint8Array).toString('base64');

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
    console.error(`[Lambda-Exception] [${traceId}] Failure: ${parsedMessage}`);

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