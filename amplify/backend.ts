import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { storage } from './storage/resource';
import { transcriptFunction } from './functions/transcript/resource';
import { aggregateSessionFunction } from './functions/aggregateSession/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { LambdaIntegration, RestApi, Cors } from 'aws-cdk-lib/aws-apigateway';
import { Function as CDKFunction } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';

/**
 * Authoritative AWS Amplify Gen 2 Cloud Stack Orchestrator.
 */
const backend = defineBackend({
  auth,
  transcriptFunction,
  aggregateSessionFunction,
  storage,
});

// Extract references to native CDK L2 Lambda constructs
const transcriptLambdaInstance = backend.transcriptFunction.resources.lambda as CDKFunction;
const aggregateLambdaInstance = backend.aggregateSessionFunction.resources.lambda as CDKFunction;

const bedrockStatement = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: [
    'bedrock:InvokeModel',
    'bedrock:InvokeModelWithResponseStream'
  ],
  resources: [
    'arn:aws:bedrock:*:*:model/amazon.titan-text-express-v1',
    'arn:aws:bedrock:*:*:model/amazon.titan-embed-text-v2:0',
    'arn:aws:bedrock:*:*:model/anthropic.claude-3-haiku-20240307-v1:0',
    'arn:aws:bedrock:*:*:model/anthropic.claude-3-sonnet-20240229-v1:0'
  ],
});

const pollyStatement = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: [
    'polly:SynthesizeSpeech',
    'polly:DescribeVoices'
  ],
  resources: ['*'],
});

if (transcriptLambdaInstance.role) {
  transcriptLambdaInstance.role.addToPrincipalPolicy(bedrockStatement);
  transcriptLambdaInstance.role.addToPrincipalPolicy(pollyStatement);
  transcriptLambdaInstance.addEnvironment('DEFAULT_MODEL_ID', 'anthropic.claude-3-haiku-20240307-v1:0');
  transcriptLambdaInstance.addEnvironment('EMBEDDING_MODEL_ID', 'amazon.titan-embed-text-v2:0');
}

if (aggregateLambdaInstance.role) {
  aggregateLambdaInstance.role.addToPrincipalPolicy(bedrockStatement);
  aggregateLambdaInstance.addEnvironment('DEFAULT_MODEL_ID', 'anthropic.claude-3-haiku-20240307-v1:0');
  aggregateLambdaInstance.addEnvironment('EMBEDDING_MODEL_ID', 'amazon.titan-embed-text-v2:0');
}

const apiGatewayCustomStack = backend.createStack('ImmigoApiGatewayStack');

const restApiGateway = new RestApi(apiGatewayCustomStack, 'ImmigoRestApiGateway', {
  restApiName: 'ImmigoVoiceServiceGateway',
  description: 'Production cloud gateway orchestrating real-time audio transcriptions, session aggregations, and Bedrock LLM loops.',
  defaultCorsPreflightOptions: {
    allowOrigins: Cors.ALL_ORIGINS,
    allowMethods: Cors.ALL_METHODS,
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-correlation-trace-id'],
    maxAge: Duration.seconds(300)
  }
});

const transcriptRouteResource = restApiGateway.root.addResource('transcript');
const transcriptLambdaIntegration = new LambdaIntegration(transcriptLambdaInstance, {
  proxy: true,
  allowTestInvoke: false
});
transcriptRouteResource.addMethod('POST', transcriptLambdaIntegration);

const completeSessionRouteResource = restApiGateway.root.addResource('complete-session');
const aggregateLambdaIntegration = new LambdaIntegration(aggregateLambdaInstance, {
  proxy: true,
  allowTestInvoke: false
});
completeSessionRouteResource.addMethod('POST', aggregateLambdaIntegration);

backend.addOutput({
  custom: {
    apiBaseUrl: restApiGateway.url,
  },
});

export default backend;