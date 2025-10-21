import { defineFunction } from '@aws-amplify/backend';

/**
 * ImmiGO Voice Assistant Backend Functions
 * 
 * This module defines the Lambda functions that serve as the backend for the ImmiGO voice assistant application.
 * The functionality is split into three specialized functions for optimal performance and resource usage.
 * 
 * Scaling Configuration:
 * - Conversation Function: High-performance with reserved concurrency
 *   - Memory: 1024MB for real-time processing
 *   - Concurrency: Up to 100 concurrent executions
 *   - Reserved: 10 instances for consistent low latency
 * 
 * - Analysis Function: Burst-oriented scaling
 *   - Memory: 512MB for text processing
 *   - Concurrency: Unreserved, scales based on demand
 *   - Auto-scaling: Based on CPU utilization
 * 
 * - Utility Function: Cost-optimized
 *   - Memory: 256MB for basic operations
 *   - Concurrency: Shared pool with other functions
 *   - Cache: Enabled for frequently accessed data
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

// Conversation Function - Handles real-time voice/text processing with reserved concurrency
export const conversationFunction = defineFunction({
  name: 'immigo-conversation',
  entry: '../functions/conversation.ts',
  memoryMB: 1024, // Optimized for streaming conversations and audio processing
  timeoutSeconds: 30,
  environment: {
    NODE_ENV: 'production',
    FUNCTION_TYPE: 'conversation',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Handles real-time conversation streaming, voice processing, and AI responses using Bedrock and Polly',
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