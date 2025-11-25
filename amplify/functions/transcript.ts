// amplify/functions/transcript.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { supabase, logger } from './clients'; // Assuming 'clients' exports supabase and logger

// Define CORS headers for all responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Or a specific origin
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
};

/**
 * A lightweight, high-performance Lambda handler for processing transcripts.
 * It replaces the previous Express-based implementation.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // Handle CORS pre-flight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: corsHeaders,
            body: '',
        };
    }

    try {
        // 1. Authentication
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Authentication token is required.' }),
            };
        }
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            logger.warn('Authentication failed', { error: authError?.message });
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Invalid or expired token.' }),
            };
        }

        logger.debug('User authenticated successfully', { userId: user.id });

        // 2. Body Validation
        if (!event.body) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Request body is missing.' }),
            };
        }

        const { transcript } = JSON.parse(event.body);
        if (!transcript) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Transcript content is required.' }),
            };
        }
        
        // 3. Business Logic (from former routes/transcript.ts)
        // TODO: Add logic to process transcript and get AI response
        // TODO: Add Polly integration to convert AI response to speech

        logger.info('Transcript received successfully', { userId: user.id, transcriptLength: transcript.length });
        
        // For now, just echo the transcript back in the response.
        const responsePayload = { 
            message: 'Transcript received.', 
            transcript,
            // Example of future data:
            // responseText: 'This is the AI response.',
            // audioData: '<base64-encoded-audio>'
        };

        // 4. Success Response
        return {
            statusCode: 200, // Changed from 201 to 200 as it's more common for this pattern
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify(responsePayload),
        };

    } catch (error) {
        // Catch parsing errors or other unexpected issues
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        logger.error('An unexpected error occurred in the transcript handler', { error: errorMessage, details: error });
        
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'An internal server error occurred.' }),
        };
    }
};