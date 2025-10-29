import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { PollyClient } from '@aws-sdk/client-polly';

// Initialize clients once and export them
export const supabase = createSupabaseClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-2' });
export const pollyClient = new PollyClient({ region: process.env.AWS_REGION || 'us-east-2' });

// Logger utility
export { logger } from './logger';