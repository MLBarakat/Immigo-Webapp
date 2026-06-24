import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { bedrockClient, pollyClient, supabase, logger } from './clients';
import { InvokeModelCommand, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { Readable } from 'stream';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
};

const sanitizeInput = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/[<>{}\[\]|`~@#$%^&*=_+]/g, '');
};

const streamToBuffer = (stream: Readable): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });

const createErrorResponse = (statusCode: number, message: string, details?: any): APIGatewayProxyResult => {
  logger.error(message, details);
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
};

// --- Route Handlers ---

async function handleAnalysis(body: any, userId: string): Promise<APIGatewayProxyResult> {
  const { conversationHistory } = body;
  if (!conversationHistory || !Array.isArray(conversationHistory) || conversationHistory.length === 0) {
    return createErrorResponse(400, 'Conversation history is required for analysis and must be a non-empty array.');
  }

  const transcript = conversationHistory.map((msg: { role: string; content: string; }) => `${msg.role}: ${msg.content}`).join('\n');
  const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      system: "You are an expert English language coach for USCIS interview preparation...",
      messages: [{ role: 'user', content: `Here is the transcript:\n\n${transcript}` }],
    }),
    accept: 'application/json',
  });

  const apiResponse = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(apiResponse.body));
  const feedbackText = responseBody.content[0].text;

  logger.info('Analysis generated successfully', { userId });
  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: feedbackText,
  };
}

async function handleConversation(body: any, userId: string): Promise<APIGatewayProxyResult> {
  const { message, conversationHistory, voiceId } = body;

  const sanitizedMessage = sanitizeInput(message);
  if (!sanitizedMessage) {
    return createErrorResponse(400, 'Message content is required.');
  }

  const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
  const streamCommand = new InvokeModelWithResponseStreamCommand({
    modelId,
    contentType: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 2048,
      messages: [
        ...(conversationHistory || []).map((msg: { role: string; content: string; }) => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: sanitizedMessage },
      ],
    }),
  });

  const bedrockResponseStream = await bedrockClient.send(streamCommand);
  let fullResponseText = "";
  if (bedrockResponseStream.body) {
    for await (const event of bedrockResponseStream.body) {
      if (event.chunk) {
        const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
        if (chunk.type === 'content_block_delta') {
          fullResponseText += chunk.delta.text;
        }
      }
    }
  }

  const pollyCommand = new SynthesizeSpeechCommand({
    Engine: 'neural',
    OutputFormat: 'mp3',
    Text: fullResponseText,
    VoiceId: voiceId || 'Joanna',
  });
  const pollyResponse = await pollyClient.send(pollyCommand);
  if (!pollyResponse.AudioStream) {
    return createErrorResponse(500, 'Polly audio stream is empty.');
  }
  const audioBuffer = await streamToBuffer(pollyResponse.AudioStream as Readable);
  const audioData = audioBuffer.toString('base64');

  Promise.all([
    supabase.from('messages').insert({ user_id: userId, role: 'user', content: sanitizedMessage }),
    supabase.from('messages').insert({ user_id: userId, role: 'assistant', content: fullResponseText })
  ]).catch(dbError => {
    logger.error('Failed to save messages to Supabase', { dbError });
  });

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ responseText: fullResponseText, audioData }),
  };
}

// --- Main Handler ---
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse(401, 'Authentication token is required.');
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse(401, 'Invalid or expired token.', { authError: authError?.message });
    }

    if (!event.body) {
      return createErrorResponse(400, 'Request body is missing.');
    }
    const body = JSON.parse(event.body);

    if (event.path.endsWith('/analyze')) {
      return await handleAnalysis(body, user.id);
    }
    if (event.path.endsWith('/conversation')) {
      return await handleConversation(body, user.id);
    }

    return createErrorResponse(404, `Route not found: ${event.httpMethod} ${event.path}`);
  } catch (error) {
    return createErrorResponse(500, 'An internal server error occurred.', { error });
  }
};