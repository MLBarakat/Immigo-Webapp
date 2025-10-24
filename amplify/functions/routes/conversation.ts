import { Router, Request, Response } from 'express';
import { authenticate } from '../authMiddleware';
import { bedrockClient, pollyClient, supabase, logger } from '../clients';
import { InvokeModelCommand, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

const router = Router();

const sanitizeInput = (text: string | null | undefined): string => {
if (!text) return '';
    return text.replace(/[<>{}[\]|`~@#$%^&*_+=]/g, '');
};

const streamToBuffer = (stream: Readable): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });

router.post('/conversation/analyze', authenticate, async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }
    const requestId = uuidv4();
    const { conversationHistory } = req.body;

    logger.info('Analysis request received', { requestId, userId: req.user.id });

    if (!conversationHistory || conversationHistory.length === 0) {
        return res.status(400).json({ error: 'Conversation history is required for analysis.' });
    }

    try {
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

        const apiResponse = await bedrockClient.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(apiResponse.body));
        const feedbackText = responseBody.content[0].text;

        logger.info('Analysis generated successfully', { requestId, userId: req.user.id });
        res.json(JSON.parse(feedbackText));

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        const errorDetails = { requestId, userId: req.user.id, errorMessage };
        logger.error('Error in /api/conversation/analyze', errorDetails);
        res.status(500).json({ error: 'Failed to analyze conversation.', errorId: requestId });
    }
});

router.post('/conversation', authenticate, async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }
    const requestId = uuidv4();
    const { message, conversationHistory, voiceId } = req.body;

    logger.info('Conversation request received', { requestId, userId: req.user.id });

    const sanitizedMessage = sanitizeInput(message);
    if (!sanitizedMessage) {
        logger.error('Validation failed: Message content is required', { requestId, userId: req.user.id });
        return res.status(400).json({ error: 'Message content is required.' });
    }

    try {
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

        const bedrockResponseStream = await bedrockClient.send(command);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Transfer-Encoding', 'chunked');

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
        const pollyResponse = await pollyClient.send(pollyCommand);
        if (!pollyResponse.AudioStream) {
            throw new Error('Polly audio stream is empty.');
        }
        const audioBuffer = await streamToBuffer(pollyResponse.AudioStream as Readable);
        const responseAudio = audioBuffer.toString('base64');
        res.write(JSON.stringify({ type: 'audio', data: responseAudio }) + '\n');

        logger.info('Polly synthesis finished', { requestId });

        await Promise.all([
            supabase.from('messages').insert({ user_id: req.user.id, role: 'user', content: sanitizedMessage }),
            supabase.from('messages').insert({ user_id: req.user.id, role: 'assistant', content: fullResponseText })
        ]);

        logger.info('Messages saved to Supabase', { requestId });

        res.end();

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        const errorDetails = { requestId, userId: req.user.id, errorMessage };
        logger.error('Unhandled error in /api/conversation', errorDetails);

        if (!res.headersSent) {
            res.status(500).json({ error: 'An internal server error occurred...', errorId: requestId });
        } else {
            res.end();
        }
    }
});

export default router;