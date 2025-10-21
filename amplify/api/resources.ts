import { defineFunction } from '@aws-amplify/backend';

/**
 * ImmiGO Voice Assistant Backend Functions
 * 
 * This module defines the Lambda functions that serve as the backend for the ImmiGO voice assistant application.
 * The functionality is split into three specialized functions for optimal performance and resource usage.
 * 
 * Common Features Across Functions:
 * - Supabase integration for data persistence
 * - Secure authentication and authorization
 * - Error handling and logging
 * - CORS support
 * 
 * Required Environment Variables for All Functions:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key
 * - API_KEY: Custom API key for additional security
 * 
 * Additional Variables for Conversation Function:
 * - DEEPGRAM_API_KEY: Deepgram API key for speech-to-text
 */

// Conversation Function - Handles real-time voice/text processing
export const conversationFunction = defineFunction({
  name: 'immigo-conversation',
  entry: '../functions/conversation.ts',
  memoryMB: 1024, // Optimized for streaming conversations and audio processing
  timeoutSeconds: 30,
  reservedConcurrentExecutions: 100, // Ensure consistent availability for real-time processing
  provisionedConcurrentExecutions: 10, // Maintain warm instances for low-latency
  environment: {
    NODE_ENV: 'production',
    FUNCTION_TYPE: 'conversation',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Handles real-time conversation streaming, voice processing, and AI responses using Bedrock and Polly',
  },
  scaling: {
    minCapacity: 10, // Minimum warm instances
    maxCapacity: 100, // Maximum concurrent executions
    targetUtilization: 0.75, // Scale when utilization reaches 75%
    metricAggregationType: 'Average',
    metrics: ['Duration', 'Invocations', 'ConcurrentExecutions', 'Errors'],
  }
});

// Analysis Function - Handles conversation analysis and feedback
export const analyzeFunction = defineFunction({
  name: 'immigo-analyze',
  entry: '../functions/analyze.ts',
  memoryMB: 512, // Optimized for text analysis without audio processing
  timeoutSeconds: 30,
  environment: {
    NODE_ENV: 'production',
    FUNCTION_TYPE: 'analyze',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Analyzes conversation transcripts for English proficiency and USCIS interview preparation feedback',
  }
});

// Utility Function - Handles settings and history management
export const utilityFunction = defineFunction({
  name: 'immigo-utility',
  entry: '../functions/utility.ts',
  memoryMB: 256, // Minimal memory for CRUD operations
  timeoutSeconds: 10, // Reduced timeout for quick operations
  environment: {
    NODE_ENV: 'production',
    FUNCTION_TYPE: 'utility',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Manages user settings, conversation history, and application preferences with optimized caching',
  }
});

// Required AWS Permissions per Function:
// 
// Conversation Function:
// - bedrock:InvokeModel
// - bedrock:InvokeModelWithResponseStream
// - polly:SynthesizeSpeech
//
// Analysis Function:
// - bedrock:InvokeModel
//
// Utility Function:
// - No additional AWS permissions required