import { Router, Request, Response, NextFunction } from 'express';
import { Readable } from 'stream';
import { InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { authenticate } from '../authMiddleware';
import { supabase, bedrockClient, pollyClient, logger } from '../clients';
import { AppError } from '../errors';

const router = Router();

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ConversationRequestBody {
  message?: string;
  conversationHistory?: Message[];
  voiceId?: string;
}

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

router.post('/conversation', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated.', 401);
    }

    const { message, conversationHistory, voiceId } = req.body as ConversationRequestBody;

    const sanitizedMessage = sanitizeInput(message);
    if (!sanitizedMessage) {
      throw new AppError('Message content is required.', 400);
    }

    logger.debug('POST /conversation request processing', { userId: req.user.id });

    // 1. Get text response from Bedrock (using stream aggregation)
    const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
    const streamCommand = new InvokeModelWithResponseStreamCommand({
      modelId,
      contentType: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2048,
        messages: [
          ...(conversationHistory || []).map((msg) => ({ role: msg.role, content: msg.content })),
          { role: 'user', content: sanitizedMessage },
        ],
      }),
    });

    const bedrockResponseStream = await bedrockClient.send(streamCommand);
    let fullResponseText = '';
    if (bedrockResponseStream.body) {
      for await (const event of bedrockResponseStream.body) {
        if (event.chunk?.bytes) {
          const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
          if (chunk.type === 'content_block_delta') {
            fullResponseText += chunk.delta.text;
          }
        }
      }
    }

    if (!fullResponseText) {
      throw new AppError('Model returned empty response.', 500);
    }

    // 2. Get audio response from Polly
    const pollyCommand = new SynthesizeSpeechCommand({
      Engine: 'neural',
      OutputFormat: 'mp3',
      Text: fullResponseText,
      VoiceId: voiceId || 'Joanna',
    });
    const pollyResponse = await pollyClient.send(pollyCommand);
    if (!pollyResponse.AudioStream) {
      throw new AppError('Polly audio stream is empty.', 500);
    }
    const audioBuffer = await streamToBuffer(pollyResponse.AudioStream as Readable);
    const audioData = audioBuffer.toString('base64');

    // 3. Save to Supabase (asynchronously, no need to wait)
    Promise.all([
      supabase.from('messages').insert({ user_id: req.user.id, role: 'user', content: sanitizedMessage }),
      supabase.from('messages').insert({ user_id: req.user.id, role: 'assistant', content: fullResponseText })
    ]).catch((dbError: unknown) => {
      logger.error('Failed to save messages to Supabase', dbError as Error);
    });

    // 4. Return combined response
    res.status(200).json({ responseText: fullResponseText, audioData });

  } catch (error) {
    next(error);
  }
});

export default router;
