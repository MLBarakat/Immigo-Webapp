/// <reference types="node" />

// amplify/functions/aggregateSession/handler.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

const region = process.env.AWS_DEFAULT_REGION || 'us-east-2';
const modelId = process.env.DEFAULT_MODEL_ID || 'anthropic.claude-haiku-4-5';
const embeddingModelId = process.env.EMBEDDING_MODEL_ID || 'amazon.titan-embed-text-v2:0';

const bedrockClient = new BedrockRuntimeClient({ region });

let supabaseClient: SupabaseClient | null = null;

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

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
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
    if (!sessionId) {
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'sessionId is required.' })
      };
    }

    console.log(`[Aggregator-Execution] [${traceId}] Processing session aggregation for session: ${sessionId}, user: ${userId}`);

    // 1. Fetch Session Messages
    const { data: sessionMessages, error: msgError } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (msgError || !sessionMessages || sessionMessages.length === 0) {
      console.log(`[Aggregator-Execution] No messages found for session ${sessionId}. Skipping aggregation.`);
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({ success: true, message: 'No messages to aggregate.' })
      };
    }

    const sessionTranscript = sessionMessages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    // 2. Fetch Previous Progress Report
    const today = new Date().toISOString().split('T')[0];
    let previousReportMarkdown = 'No previous progress report recorded.';

    const { data: latestReport } = await supabase
      .from('daily_progress_reports')
      .select('report_markdown')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestReport?.report_markdown) {
      previousReportMarkdown = latestReport.report_markdown;
    }

    // 3. Build Bedrock Evaluation Prompt
    const evaluationSystemPrompt = `You are an expert USCIS N-400 Naturalization Exam Evaluator.
Your task is to analyze the candidate's oral interview session transcript and generate/update their Daily Progress Report in Markdown format.

USCIS N-400 Examination Categories:
1. American Government (Principles of Democracy, System of Government, Rights and Responsibilities)
2. American History (Colonial Period & Independence, 1800s, Recent American History & Other Important Historical Information)
3. Integrated Civics (Geography, Symbols, Holidays)

Instructions:
- Evaluate the candidate's performance in practiced categories during this session.
- For categories NOT practiced in this session, inherit the previous scores and feedback from the Previous Progress Report.
- Output a clean, structured Markdown report including:
  - Overall Session Summary
  - Category Breakdown & Scores (e.g. American Government: 85/100, American History: 70/100, Integrated Civics: 90/100)
  - Key Strengths
  - Specific Weak Spots & Failed Questions
  - Recommended Next Review Topics`;

    const bedrockEvaluationPayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 800,
      temperature: 0.3,
      system: evaluationSystemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Previous Progress Report:\n${previousReportMarkdown}\n\nCurrent Session Transcript:\n${sessionTranscript}\n\nPlease generate the updated Living Daily Progress Report for date ${today}.`
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

    const bedrockResponse = await bedrockClient.send(bedrockCommand);
    const bodyString = Buffer.from(bedrockResponse.body).toString('utf-8');
    const parsedData = JSON.parse(bodyString) as BedrockResponseShape;
    const reportMarkdown = parsedData.content?.[0]?.text?.trim() || '';

    if (!reportMarkdown) {
      throw new Error('Evaluation Exception: Bedrock returned empty report text.');
    }

    console.log(`[Aggregator-Execution] Generated progress report (${reportMarkdown.length} chars)`);

    // 4. Generate Embedding Vector using Titan v2
    const embeddingVector = await getTitanEmbedding(reportMarkdown);

    // 5. UPSERT into daily_progress_reports (on conflict user_id, date)
    const { error: upsertError } = await supabase
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
      body: JSON.stringify({ success: true, date: today })
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
