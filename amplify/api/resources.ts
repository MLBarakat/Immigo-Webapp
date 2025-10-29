import { defineFunction } from '@aws-amplify/backend';

/**
 * ImmiGO Voice Assistant Backend Functions
 * 
 * This module defines the Lambda functions that serve as the backend for the ImmiGO voice assistant application.
 * The functionality is split into three specialized functions for optimal performance and resource usage.
 * 
 * Function Configuration:
 * 
 * 1. Conversation Function (immigo-conversation):
 *    - Purpose: Real-time voice/text processing and AI responses
 *    - Configuration:
 *      - Memory: 1024 MB
 *      - Timeout: 30 seconds
 *      - Scaling: 10-100 instances
 *      - Target Utilization: 75%
 *      - CloudWatch Alarms:
 *        - Concurrent Executions: > 80
 *        - Error Rate: > 5
 * 
 * 2. Analysis Function (immigo-analyze):
 *    - Purpose: Conversation analysis and feedback
 *    - Configuration:
 *      - Memory: 512 MB
 *      - Timeout: 30 seconds
 *      - Scaling: 5-50 instances
 *      - Target Utilization: 70%
 *      - CloudWatch Alarms:
 *        - Concurrent Executions: > 50
 *        - Error Rate: > 10
 * 
 * 3. Utility Function (immigo-utility):
 *    - Purpose: Settings and history management
 *    - Configuration:
 *      - Memory: 256 MB
 *      - Timeout: 10 seconds
 *      - Scaling: 3-30 instances
 *      - Target Utilization: 65%
 *      - CloudWatch Alarms:
 *        - Concurrent Executions: > 30
 *        - Error Rate: > 5
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
 * - SUPABASE_API_KEY: Custom API key for additional security
 * 
 * Additional Variables for Conversation Function:
 * - DEEPGRAM_API_KEY: Deepgram API key for speech-to-text
 */

// Conversation Function - Handles real-time voice/text processing with reserved concurrency
export const conversationFunction = defineFunction({
  name: 'conversation-function',
  entry: '../functions/conversation.ts',
  environment: {
    NODE_ENV: 'production',
    FUNCTION_TYPE: 'conversation',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Handles real-time conversation streaming, voice processing, and AI responses using Bedrock and Polly',
    VERSION: '1.0.0'
  }
});

// Analysis Function - Handles conversation analysis and feedback
export const analyzeFunction = defineFunction({
  name: 'analyze-function',
  entry: '../functions/analyze.ts',
  environment: {
    NODE_ENV: 'production',
    FUNCTION_TYPE: 'analyze',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Analyzes conversation transcripts for English proficiency and USCIS interview preparation feedback',
    VERSION: '1.0.0'
  }
});

// Utility Function - Handles settings and history management
export const utilityFunction = defineFunction({
  name: 'utility-function',
  entry: '../functions/utility.ts',
  environment: {
    NODE_ENV: 'production',
    FUNCTION_TYPE: 'utility',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Manages user settings, conversation history, and application preferences with optimized caching',
    VERSION: '1.0.0'
  }
});

// Config Function - Serves public configuration to the frontend
export const configFunction = defineFunction({
  name: 'config-function',
  entry: '../functions/config.ts',
  environment: {
    NODE_ENV: 'production',
    FUNCTION_TYPE: 'config',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Provides public configuration variables to the frontend client',
    VERSION: '1.0.0'
  }
});

// Settings Function - Manages user-specific settings
export const settingsFunction = defineFunction({
  name: 'settings-function',
  entry: '../functions/settings.ts',
  environment: {
    NODE_ENV: 'production',
    FUNCTION_TYPE: 'settings',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Manages user profile settings.',
    VERSION: '1.0.0'
  }
});

// History Function - Manages user conversation history
export const historyFunction = defineFunction({
  name: 'history-function',
  entry: '../functions/history.ts',
  environment: {
    NODE_ENV: 'production',
    FUNCTION_TYPE: 'history',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Manages user conversation history.',
    VERSION: '1.0.0'
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