import { defineFunction } from '@aws-amplify/backend';

// Determine the environment from a build-time environment variable
const nodeEnv = process.env.NODE_ENV === 'DEV' ? 'development' : 'production';

// Conversation Function
export const conversationFunction = defineFunction({
  entry: '../functions/conversation.ts',
  environment: {
    NODE_ENV: nodeEnv,
    FUNCTION_TYPE: 'conversation',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Handles real-time conversation streaming, voice processing, and AI responses using Bedrock and Polly',
    VERSION: '1.0.0'
  }
});

// Analysis Function
export const analyzeFunction = defineFunction({
  entry: '../functions/analyze.ts',
  environment: {
    NODE_ENV: nodeEnv,
    FUNCTION_TYPE: 'analyze',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Analyzes conversation transcripts for English proficiency and USCIS interview preparation feedback',
    VERSION: '1.0.0'
  }
});

// Utility Function
export const utilityFunction = defineFunction({
  entry: '../functions/utility.ts',
  environment: {
    NODE_ENV: nodeEnv,
    FUNCTION_TYPE: 'utility',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Manages user settings, conversation history, and application preferences with optimized caching',
    VERSION: '1.0.0'
  }
});

// Config Function
export const configFunction = defineFunction({
  entry: '../functions/config.ts',
  environment: {
    NODE_ENV: nodeEnv,
    FUNCTION_TYPE: 'config',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Provides public configuration variables to the frontend client',
    VERSION: '1.0.0'
  }
});

// Settings Function
export const settingsFunction = defineFunction({
  entry: '../functions/settings.ts',
  environment: {
    NODE_ENV: nodeEnv,
    FUNCTION_TYPE: 'settings',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Manages user profile settings.',
    VERSION: '1.0.0'
  }
});

// History Function
export const historyFunction = defineFunction({
  entry: '../functions/history.ts',
  environment: {
    NODE_ENV: nodeEnv,
    FUNCTION_TYPE: 'history',
    LOG_LEVEL: 'info',
    DESCRIPTION: 'Manages user conversation history.',
    VERSION: '1.0.0'
  }
});
