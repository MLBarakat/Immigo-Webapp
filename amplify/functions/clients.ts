import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { PollyClient } from '@aws-sdk/client-polly';

// Initialize clients once and export them
export const supabase = createSupabaseClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-2' });
export const pollyClient = new PollyClient({ region: process.env.AWS_REGION || 'us-east-2' });

// Logger utility
export const logger = {
info: (message, context = {}) => console.log(JSON.stringify({ level: 'INFO', timestamp: new Date().toISOString(), message, ...context })),
  error: (message, context = {}) => console.error(JSON.stringify({ level: 'ERROR', timestamp: new Date().toISOString(), message, ...context }))
};