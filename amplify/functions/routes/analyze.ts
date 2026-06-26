// amplify/functions/routes/analyze.ts

import { Router, Request, Response, NextFunction } from 'express';
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { authenticate } from '../authMiddleware';
import { bedrockClient, logger } from '../clients';
import { AppError } from '../errors';

const router = Router();

interface ConversationMessage {
  role: string;
  content: string;
}

interface AnalyzeRequestBody {
  conversationHistory?: ConversationMessage[];
}

router.post('/analyze', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated.', 401);
    }

    const { conversationHistory } = req.body as AnalyzeRequestBody;
    if (!conversationHistory || !Array.isArray(conversationHistory) || conversationHistory.length === 0) {
      throw new AppError('Conversation history is required for analysis and must be a non-empty array.', 400);
    }

    logger.debug('POST /analyze request received, compiling transcript', { userId: req.user.id });

    // Reconstruct the user dialogue ledger matching the exact legacy syntax
    const transcript = conversationHistory
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1024,
        system: "You are an expert English language coach for USCIS interview preparation. Analyze the following transcript of a mock interview. Provide feedback on grammar, pronunciation issues (if noted in text), vocabulary, and overall readiness for the USCIS naturalization interview. Be constructive, encouraging, and clear.",
        messages: [{ role: 'user', content: `Here is the transcript:\n\n${transcript}` }],
      }),
      accept: 'application/json',
    });

    const apiResponse = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(apiResponse.body));
    const feedbackText = responseBody.content[0].text;

    logger.info('Analysis generated successfully via Bedrock Claude Sonnet', { userId: req.user.id });

    // Set appropriate text/json response headers matching the legacy structure
    res.status(200).json({ feedback: feedbackText });

  } catch (error) {
    next(error);
  }
});

export default router;