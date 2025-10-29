import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../authMiddleware';
import { bedrockClient, pollyClient, supabase, logger } from '../clients';
import { InvokeModelCommand, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { AppError } from '../errors';

const router = Router();

const sanitizeInput = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/[<>{}\[\]|`~@#$%^&*_+=]/g, '');
};

const streamToBuffer = (stream: Readable): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });

router.post('/conversation/analyze', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  const requestId = uuidv4();
  logger.debug('POST /conversation/analyze request received', { requestId, userId: req.user?.id });

  try {
    if (!req.user) {
      throw new AppError('User not authenticated.', 401);
    }
    const { conversationHistory } = req.body;

    if (!conversationHistory || !Array.isArray(conversationHistory) || conversationHistory.length === 0) {
      throw new AppError('Conversation history is required for analysis and must be a non-empty array.', 400);
    }

    const transcript = conversationHistory.map((msg: { role: string; content: string; }) => `${msg.role}: ${msg.content}`).join('\n');
    const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
    const prompt = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1024,
        system: "You are an expert English language coach for USCIS interview preparation...",
        messages: [{ role: 'user', content: `Here is the transcript:\n\n${transcript}` }],
    };

    const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        body: JSON.stringify(prompt),
        accept: 'application/json',
    });

    logger.debug('Sending analysis request to Bedrock', { requestId, modelId });
    const apiResponse = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(apiResponse.body));
    const feedbackText = responseBody.content[0].text;

    logger.info('Analysis generated successfully', { requestId, userId: req.user.id });
    res.json(JSON.parse(feedbackText));

  } catch (error) {
    next(new AppError('Failed to analyze conversation.', 500, true, { originalError: error, requestId }));
  }
});

router.post('/conversation', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  const requestId = uuidv4();
  logger.debug('POST /conversation request received', { requestId, userId: req.user?.id });

  try {
    if (!req.user) {
      throw new AppError('User not authenticated.', 401);
    }
    const { message, conversationHistory, voiceId } = req.body;

    const sanitizedMessage = sanitizeInput(message);
    if (!sanitizedMessage) {
      throw new AppError('Message content is required.', 400);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
    const prompt = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2048,
        messages: [
            ...(conversationHistory || []).map((msg: { role: string; content: string; }) => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: sanitizedMessage },
        ],
    };

    const command = new InvokeModelWithResponseStreamCommand({
        modelId,
        contentType: 'application/json',
        body: JSON.stringify(prompt),
    });

    logger.debug('Sending conversation stream request to Bedrock', { requestId, modelId });
    const bedrockResponseStream = await bedrockClient.send(command);

    let fullResponseText = "";
    if (bedrockResponseStream.body) {
        for await (const event of bedrockResponseStream.body) {
            if (event.chunk) {
                const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
                if (chunk.type === 'content_block_delta') {
                    const textChunk = chunk.delta.text;
                    fullResponseText += textChunk;
                    res.write(JSON.stringify({ type: 'text', data: textChunk }) + '\n');
                }
            }
        }
    }
    logger.info('Bedrock stream finished', { requestId, responseLength: fullResponseText.length });

    const pollyCommand = new SynthesizeSpeechCommand({
        Engine: 'neural',
        OutputFormat: 'mp3',
        Text: fullResponseText,
        VoiceId: voiceId || 'Joanna',
    });

    logger.debug('Sending synthesis request to Polly', { requestId });
    const pollyResponse = await pollyClient.send(pollyCommand);
    if (!pollyResponse.AudioStream) {
        throw new AppError('Polly audio stream is empty.', 500, false, { requestId });
    }
    const audioBuffer = await streamToBuffer(pollyResponse.AudioStream as Readable);
    const responseAudio = audioBuffer.toString('base64');
    res.write(JSON.stringify({ type: 'audio', data: responseAudio }) + '\n');
    logger.info('Polly synthesis finished', { requestId });

    logger.debug('Saving messages to Supabase', { requestId });
    const { error: userMessageError } = await supabase.from('messages').insert({ user_id: req.user.id, role: 'user', content: sanitizedMessage });
    if (userMessageError) throw new AppError('Failed to save user message.', 500, true, { dbError: userMessageError, requestId });

    const { error: assistantMessageError } = await supabase.from('messages').insert({ user_id: req.user.id, role: 'assistant', content: fullResponseText });
    if (assistantMessageError) throw new AppError('Failed to save assistant message.', 500, true, { dbError: assistantMessageError, requestId });

    logger.info('Messages saved to Supabase', { requestId });

    res.end();

  } catch (error) {
    next(error);
  }
});

export default router;
