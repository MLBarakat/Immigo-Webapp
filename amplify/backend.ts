import { defineBackend } from '@aws-amplify/backend';
import {
  conversationFunction,
  analyzeFunction,
  utilityFunction,
  configFunction,
  settingsFunction,
  historyFunction,
  transcriptFunction
} from './api/resources';
import { auth } from './auth/resource';
import { storage } from './storage/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Duration } from 'aws-cdk-lib';
import { secret } from '@aws-amplify/backend';

// Determine the environment from a build-time environment variable to control staging
const nodeEnv = process.env.NODE_ENV || 'DEV';

const backend = defineBackend({
  auth,
  storage,
  conversationFunction: {
    ...conversationFunction,
    memorySize: 1024,
    timeout: Duration.seconds(30)
  },
  analyzeFunction: {
    ...analyzeFunction,
    memorySize: 512,
    timeout: Duration.seconds(30)
  },
  utilityFunction: {
    ...utilityFunction,
    memorySize: 256,
    timeout: Duration.seconds(10)
  },
  configFunction: {
    ...configFunction,
    // FIX: Upgraded memory and timeout to provide adequate headroom for Express server compilation on cold-starts
    memorySize: 512,
    timeout: Duration.seconds(10)
  },
  settingsFunction: {
    ...settingsFunction,
    memorySize: 256,
    timeout: Duration.seconds(10)
  },
  historyFunction: {
    ...historyFunction,
    memorySize: 256,
    timeout: Duration.seconds(10)
  },
  transcriptFunction: {
    ...transcriptFunction,
    memorySize: 512,
    timeout: Duration.seconds(20)
  }
});

// Created a dedicated custom stack space using Amplify Gen 2 standards to fix the backend.stack compilation issue
const apiStack = backend.createStack(`immigo-gateway-stack-${nodeEnv}`);

// HTTP API Gateway
const gatewayAPI = new apigateway.RestApi(apiStack, 'GatewayApi', {
  restApiName: `immigo-gateway-${nodeEnv}`,
  description: `ImmiGO API Gateway - ${nodeEnv}`,
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
    allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
    maxAge: Duration.days(1),
  },
  deployOptions: {
    stageName: nodeEnv,
    throttlingRateLimit: 10000,
    throttlingBurstLimit: 5000,
    metricsEnabled: true,
    loggingLevel: apigateway.MethodLoggingLevel.INFO,
  },
});

// HTTP Integrations
const conversationIntegration = new apigateway.LambdaIntegration(backend.conversationFunction.resources.lambda, { proxy: true });
const analyzeIntegration = new apigateway.LambdaIntegration(backend.analyzeFunction.resources.lambda, { proxy: true });
const utilityIntegration = new apigateway.LambdaIntegration(backend.utilityFunction.resources.lambda, { proxy: true });
const configIntegration = new apigateway.LambdaIntegration(backend.configFunction.resources.lambda, { proxy: true });
const settingsIntegration = new apigateway.LambdaIntegration(backend.settingsFunction.resources.lambda, { proxy: true });
const historyIntegration = new apigateway.LambdaIntegration(backend.historyFunction.resources.lambda, { proxy: true });
const transcriptIntegration = new apigateway.LambdaIntegration(backend.transcriptFunction.resources.lambda, { proxy: true });

const apiRoot = gatewayAPI.root.addResource('api');

// HTTP Routes
apiRoot.addResource('conversation').addMethod('POST', conversationIntegration);
apiRoot.addResource('analyze').addMethod('POST', analyzeIntegration);
apiRoot.addResource('utility').addMethod('ANY', utilityIntegration);
apiRoot.addResource('config').addMethod('GET', configIntegration);
const settingsResource = apiRoot.addResource('settings');
settingsResource.addMethod('GET', settingsIntegration);
settingsResource.addMethod('PUT', settingsIntegration);
apiRoot.addResource('history').addMethod('GET', historyIntegration);
apiRoot.addResource('transcript').addMethod('POST', transcriptIntegration);

// Policies
const bedrockPolicy = new PolicyStatement({ actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'], resources: ['*'] });
const pollyPolicy = new PolicyStatement({ actions: ['polly:SynthesizeSpeech'], resources: ['*'] });

backend.conversationFunction.resources.lambda.addToRolePolicy(bedrockPolicy);
backend.conversationFunction.resources.lambda.addToRolePolicy(pollyPolicy);
backend.analyzeFunction.resources.lambda.addToRolePolicy(bedrockPolicy);

// Environment Variables
backend.conversationFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.conversationFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));

backend.analyzeFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.analyzeFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));

backend.utilityFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.utilityFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));

backend.settingsFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));

backend.historyFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));

backend.transcriptFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.transcriptFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));

backend.configFunction.addEnvironment('SUPABASE_URL', process.env.SUPABASE_URL || '');
backend.configFunction.addEnvironment('SUPABASE_ANON_KEY', secret('SUPABASE_ANON_KEY'));

// Outputs
backend.addOutput({
  custom: {
    API_URL: gatewayAPI.url,
    API_ENDPOINT: `${gatewayAPI.url}api`,
    StorageBucketName: backend.storage.resources.bucket.bucketName,
  },
});