/// <reference types="node" />

// amplify/functions/transcript/handler.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { createClient } from '@supabase/supabase-js';

// Initialize AWS Clients outside the handler loop to leverage runtime global container TCP socket reuse
const region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const modelId = process.env.DEFAULT_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

const bedrockClient = new BedrockRuntimeClient({ region });
const pollyClient = new PollyClient({ region });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

interface RequestBody {
  transcript?: string;
}

interface BedrockResponseShape {
  content?: Array<{ type: 'text'; text: string }>;
}

/**
 * Structural type mapping interface to bypass the AWS SDK v3 cross-platform stream union type limitation.
 */
interface ExtendedSdkStream {
  transformToByteArray(): Promise<Uint8Array>;
}

/**
 * Scans incoming event proxy headers in a case-insensitive manner to prevent distributed trace tokens from dropping.
 */
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

/**
 * Authoritative Serverless Event Handler.
 * Processes real-time audio transcripts, sends them to Bedrock, and returns Polly audio base64 buffers.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Extract and align the tracking tokens across cloud partitions
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

    // 1. Inbound Ingestion Guard Gates
    if (!event.body) {
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Payload Exception: Missing inbound JSON body configuration parameters.' })
      };
    }

    let parsedBody: RequestBody;
    try {
      parsedBody = JSON.parse(event.body) as RequestBody;
    } catch {
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Malformed JSON Exception: Failed to accurately process request string parameters.' })
      };
    }

    const rawTranscript = parsedBody.transcript || '';
    const cleanedTranscript = rawTranscript.replace(/\s+/g, ' ').trim();

    if (!cleanedTranscript) {
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({ responseText: '', audioData: '' })
      };
    }

    console.log(`[Lambda-Execution] [${traceId}] Processing verified text segment: "${cleanedTranscript}"`);

    // 2. Build Bedrock Pipeline Using The Modern Messages API Payload Schema
    const bedrockRequestPayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 250,
      temperature: 0.5,
      system: 'You are an intelligent, empathetic language learning AI assistant. Keep responses short, highly conversational, and natural.',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: cleanedTranscript }]
        }
      ]
    };

    const bedrockCommand = new InvokeModelCommand({
      modelId: modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(bedrockRequestPayload)
    });

    const bedrockResponse = await bedrockClient.send(bedrockCommand);
    
    // Decodes the response body bytes cleanly using native Node conversion structures
    const bedrockResponseBodyString = Buffer.from(bedrockResponse.body).toString('utf-8');
    const parsedBedrockData = JSON.parse(bedrockResponseBodyString) as BedrockResponseShape;
    const generatedAssistantText = parsedBedrockData.content?.[0]?.text?.trim() || '';

    if (!generatedAssistantText) {
      throw new Error('Inference Exception: Inbound payload returned an empty text layer context from Bedrock runtime.');
    }

    console.log(`[Lambda-Execution] [${traceId}] Bedrock prompt execution success: "${generatedAssistantText}"`);

    // 3. Audio Synthesis via Amazon Polly Neural Engines
    const pollyCommand = new SynthesizeSpeechCommand({
      OutputFormat: 'mp3',
      Text: generatedAssistantText,
      VoiceId: 'Joanna',
      Engine: 'neural'
    });

    const pollyResponse = await pollyClient.send(pollyCommand);

    if (!pollyResponse.AudioStream) {
      throw new Error('Synthesis Exception: Amazon Polly service returned an empty audio payload stream container.');
    }

    // Resolved union typing failures cleanly using precise structural interface assertions
    const verifiableSdkStream = pollyResponse.AudioStream as unknown as ExtendedSdkStream;
    const audioUint8Array = await verifiableSdkStream.transformToByteArray();
    
    // High-performance binary-to-string conversion using Node's native base64 mapping engine
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
    const parsedMessage = error instanceof Error ? error.message : 'An unhandled exception occurred within the serverless runtime.';
    
    console.error(`[Lambda-Exception] [${traceId}] Critical architecture failure: ${parsedMessage}`, {
      errorContext: error
    });

    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({
        error: `Serverless Infrastructure Transaction Failure: ${parsedMessage}`,
        traceId
      })
    };
  }
};