import { defineFunction } from '@aws-amplify/backend';

/**
 * ImmiGO Voice Assistant Lambda Function
 * 
 * This Lambda function serves as the backend for the ImmiGO voice assistant application.
 * It handles various API endpoints for conversation management, user settings, and audio processing.
 * 
 * Key Features:
 * - Real-time voice processing and streaming
 * - Integration with Amazon Bedrock for AI responses
 * - Text-to-Speech conversion using Amazon Polly
 * - User settings and conversation history management
 * - Supabase integration for data persistence
 * 
 * API Endpoints:
 * - /api/conversation: Handles voice/text conversations
 * - /api/settings: Manages user preferences
 * - /api/history: Manages conversation history
 * - /health: System health check endpoint
 * 
 * Infrastructure:
 * - Memory: 1024MB (optimized for audio processing)
 * - Timeout: 30 seconds (maximum for API Gateway)
 * - Runtime: Node.js 18.x
 * - VPC: No VPC (public Lambda)
 * 
 * Required Environment Variables:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key
 * - DEEPGRAM_API_KEY: Deepgram API key for speech-to-text
 * - API_KEY: Custom API key for additional security
 * 
 * Required AWS Permissions:
 * - bedrock:InvokeModel
 * - bedrock:InvokeModelWithResponseStream
 * - polly:SynthesizeSpeech
 */
export const apiFunction = defineFunction({
  name: 'immigo-function',
  entry: '../functions/handler.ts',
  memoryMB: 1024,
  timeoutSeconds: 30,
  environment: {
    NODE_ENV: 'production',
    FUNCTION_NAME: 'immigo-function',
    FUNCTION_VERSION: '1.0.0',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'ImmiGO Voice Assistant API - Real-time conversation processing with AI capabilities'
  }
});
