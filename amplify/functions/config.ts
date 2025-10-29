import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from './logger';
import { AppError } from './errors';

// Helper to create a standard API Gateway response
const createResponse = (statusCode: number, body: object) => {
    return {
        statusCode,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*"
        },
        body: JSON.stringify(body),
    };
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Log all environment variables for debugging purposes
  logger.debug('Dumping all environment variables', { env: process.env });

  logger.debug('Config function execution started', { path: event.path });

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
      throw new AppError('Supabase URL is not set or is invalid in environment variables.', 500, true, { check: 'SUPABASE_URL' });
    }
    logger.debug('Supabase URL validation passed.');

    if (!supabaseAnonKey) {
      throw new AppError('Supabase anon key is not set in environment variables.', 500, true, { check: 'SUPABASE_ANON_KEY' });
    }
    logger.debug('Supabase anon key validation passed.');

    const responseBody = { supabaseUrl, supabaseAnonKey };
    // In development, we log more details. In production, we log minimally.
    logger.info('Successfully retrieved Supabase configuration.', { 
      urlHost: process.env.NODE_ENV === 'DEV' ? supabaseUrl.split('//')[1].split('.')[0] : undefined
    });

    return createResponse(200, responseBody);

  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError('An unexpected error occurred in config function.', 500, false);

    logger.error(appError.message, appError, {
      isOperational: appError.isOperational,
      context: appError.context,
      path: event.path,
    });

    // Only show detailed error messages in development
    const errorMessage = process.env.NODE_ENV === 'DEV' ? appError.message : 'An internal server error occurred.';
    return createResponse(appError.statusCode, { error: errorMessage });
  }
};