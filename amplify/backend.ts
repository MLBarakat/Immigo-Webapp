import { defineBackend } from '@aws-amplify/backend';
import { conversationFunction, analyzeFunction, utilityFunction } from './api/functions';
import { auth } from './auth/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Duration } from 'aws-cdk-lib';
import { secret } from '@aws-amplify/backend';

/**
 * ImmiGO Voice Assistant Backend Infrastructure
 * - Handles API Gateway integration with optimized configurations
 * - Manages multiple Lambda functions with specific memory allocations
 * - Sets up IAM permissions
 * - Configures CORS, security, and caching
 */
const backend = defineBackend({
  auth,
  conversationFunction,
  analyzeFunction,
  utilityFunction,
});

// API Gateway integration with optimizations
const api = new apigateway.RestApi(backend.stack, 'RestApi', {
  restApiName: 'immigo-api',
  description: 'ImmiGO API Gateway - Optimized for performance and cost',
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
    allowHeaders: [
      'Content-Type',
      'X-Amz-Date',
      'Authorization',
      'X-Api-Key',
      'X-Amz-Security-Token',
    ],
    maxAge: Duration.days(1),
  },
  // Configure throttling and caching
  deployOptions: {
    throttlingRateLimit: 10000,
    throttlingBurstLimit: 5000,
    metricsEnabled: true,
    loggingLevel: apigateway.MethodLoggingLevel.INFO,
  },
});

// Conversation endpoints (high memory)
const conversationIntegration = new apigateway.LambdaIntegration(
  backend.conversationFunction.resources.lambda,
  {
    proxy: true,
    allowTestInvoke: true,
    integrationResponses: [{
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Origin': "'*'",
      },
    }],
  }
);

// Analysis endpoints (medium memory)
const analyzeIntegration = new apigateway.LambdaIntegration(
  backend.analyzeFunction.resources.lambda,
  {
    proxy: true,
    allowTestInvoke: true,
    integrationResponses: [{
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Origin': "'*'",
      },
    }],
  }
);

// Utility endpoints (low memory)
const utilityIntegration = new apigateway.LambdaIntegration(
  backend.utilityFunction.resources.lambda,
  {
    proxy: true,
    allowTestInvoke: true,
    integrationResponses: [{
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Origin': "'*'",
      },
    }],
  }
);

// Route configurations
const conversation = api.root.addResource('conversation');
conversation.addMethod('POST', conversationIntegration, {
  authorizationType: apigateway.AuthorizationType.IAM,
  methodResponses: [{ statusCode: '200' }],
});

const analyze = api.root.addResource('analyze');
analyze.addMethod('POST', analyzeIntegration, {
  authorizationType: apigateway.AuthorizationType.IAM,
  methodResponses: [{ statusCode: '200' }],
});

const utility = api.root.addResource('utility');
utility.addMethod('ANY', utilityIntegration, {
  authorizationType: apigateway.AuthorizationType.IAM,
  methodResponses: [{ statusCode: '200' }],
  requestParameters: {
    'method.request.querystring.userId': true,
  },
});

// Add IAM policies to Lambda functions
const bedrockPolicy = new PolicyStatement({
  actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
  resources: ['*'],
});

const pollyPolicy = new PolicyStatement({
  actions: ['polly:SynthesizeSpeech'],
  resources: ['*'],
});

// Add policies to conversation and analyze functions
backend.conversationFunction.resources.lambda.addToRolePolicy(bedrockPolicy);
backend.conversationFunction.resources.lambda.addToRolePolicy(pollyPolicy);
backend.analyzeFunction.resources.lambda.addToRolePolicy(bedrockPolicy);

// Add environment variables to conversation function
backend.conversationFunction.addEnvironment('SUPABASE_URL', secret('SUPABASE_URL'));
backend.conversationFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.conversationFunction.addEnvironment('API_KEY', secret('API_KEY'));
backend.conversationFunction.addEnvironment('DEEPGRAM_API_KEY', secret('DEEPGRAM_API_KEY'));
backend.conversationFunction.addEnvironment('FUNCTION_TYPE', 'conversation');

// Add environment variables to analyze function
backend.analyzeFunction.addEnvironment('SUPABASE_URL', secret('SUPABASE_URL'));
backend.analyzeFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.analyzeFunction.addEnvironment('API_KEY', secret('API_KEY'));
backend.analyzeFunction.addEnvironment('FUNCTION_TYPE', 'analyze');

// Add environment variables to utility function
backend.utilityFunction.addEnvironment('SUPABASE_URL', secret('SUPABASE_URL'));
backend.utilityFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.utilityFunction.addEnvironment('API_KEY', secret('API_KEY'));
backend.utilityFunction.addEnvironment('FUNCTION_TYPE', 'utility');

// Output
backend.addOutput({
  custom: { 
    API_URL: api.url,
    API_ENDPOINT: `${api.url}api`
  },
});