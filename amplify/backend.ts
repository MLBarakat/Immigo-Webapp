import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { storage } from './storage/resource';
import { transcriptFunction } from './functions/transcript/resource';
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
  storage,
});

// Extract a stable reference to the underlying native L2 Lambda construct
const lambdaFunctionInstance = backend.transcriptFunction.resources.lambda as CDKFunction;

if (lambdaFunctionInstance.role) {
  const bedrockStatement = new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'bedrock:InvokeModel',
      'bedrock:InvokeModelWithResponseStream'
    ],
    resources: [
      'arn:aws:bedrock:*:*:model/amazon.titan-text-express-v1',
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

  lambdaFunctionInstance.role.addToPrincipalPolicy(bedrockStatement);
  lambdaFunctionInstance.role.addToPrincipalPolicy(pollyStatement);
  lambdaFunctionInstance.addEnvironment('DEFAULT_MODEL_ID', 'anthropic.claude-3-haiku-20240307-v1:0');
} else {
  throw new Error('Deployment Exception: Unable to locate the execution role for the transcriptFunction stack.');
}

const apiGatewayCustomStack = backend.createStack('ImmigoApiGatewayStack');

const restApiGateway = new RestApi(apiGatewayCustomStack, 'ImmigoRestApiGateway', {
  restApiName: 'ImmigoVoiceServiceGateway',
  description: 'Production cloud gateway orchestrating real-time audio transcriptions and Bedrock LLM loops.',
  defaultCorsPreflightOptions: {
    allowOrigins: Cors.ALL_ORIGINS,
    allowMethods: Cors.ALL_METHODS,
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-correlation-trace-id'],
    maxAge: Duration.seconds(300)
  }
});

const transcriptRouteResource = restApiGateway.root.addResource('transcript');
const lambdaProxyIntegration = new LambdaIntegration(lambdaFunctionInstance, {
  proxy: true,
  allowTestInvoke: false
});

transcriptRouteResource.addMethod('POST', lambdaProxyIntegration);

backend.addOutput({
  custom: {
    apiBaseUrl: restApiGateway.url,
  },
});

export default backend;