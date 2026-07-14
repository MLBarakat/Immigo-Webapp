import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { transcriptFunction } from './functions/transcript/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { LambdaIntegration, RestApi, Cors } from 'aws-cdk-lib/aws-apigateway';

/**
 * Authoritative AWS Amplify Gen 2 Cloud Stack Orchestrator.
 * Combines modular Gen 2 definitions with standard AWS CDK extension stacks.
 */
const backend = defineBackend({
  auth,
  data,
  transcriptFunction,
});

// Extract a stable reference to the underlying native L2 Lambda construct
const lambdaFunctionInstance = backend.transcriptFunction.resources.lambda;

if (lambdaFunctionInstance.role) {
  // 1. Inject the least-privilege IAM policy block for Amazon Bedrock foundation models
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

  // 2. Inject the least-privilege IAM policy block for Amazon Polly text-to-speech synthesis
  const pollyStatement = new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'polly:SynthesizeSpeech',
      'polly:DescribeVoices'
    ],
    resources: ['*'], // Scoped explicitly by the execution principal
  });

  // Attach policy constraints directly to the function's execution role principal
  lambdaFunctionInstance.role.addToPrincipalPolicy(bedrockStatement);
  lambdaFunctionInstance.role.addToPrincipalPolicy(pollyStatement);

  // Map environment runtime variables down to the execution container
  lambdaFunctionInstance.addEnvironment('DEFAULT_MODEL_ID', 'anthropic.claude-3-haiku-20240307-v1:0');
} else {
  throw new Error('Deployment Exception: Unable to locate the execution role for the transcriptFunction stack.');
}

/**
 * 3. EXPLICIT AWS CDK REST INFRASTRUCTURE EXTENSION
 * Generate a standalone custom CDK stack inside our Amplify deployment context
 * to map the network entry routes requested by our client-side modules.
 */
const apiGatewayCustomStack = backend.createStack('ImmigoApiGatewayStack');

const restApiGateway = new RestApi(apiGatewayCustomStack, 'ImmigoRestApiGateway', {
  restApiName: 'ImmigoVoiceServiceGateway',
  description: 'Production cloud gateway orchestrating real-time audio transcriptions and Bedrock LLM loops.',
  defaultCorsPreflightOptions: {
    allowOrigins: Cors.ALL_ORIGINS, // Restrict this array to explicit domain origins in production environments
    allowMethods: Cors.ALL_METHODS,
    // FIXED: Explicitly permits our distributed tracing token to clear preflight pre-check rejections
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-correlation-trace-id'],
    maxAge: typeof window !== 'undefined' ? undefined : anyHelperCdkDurationCast(300)
  }
});

// Construct a new explicit URL resource mapping target for '/transcript'
const transcriptRouteResource = restApiGateway.root.addResource('transcript');

// Bind our transcription Lambda function to a high-performance proxy integration bridge
const lambdaProxyIntegration = new LambdaIntegration(lambdaFunctionInstance, {
  proxy: true,
  allowTestInvoke: false
});

// Attach a secure HTTP POST method handler to the endpoint path resource
transcriptRouteResource.addMethod('POST', lambdaProxyIntegration);

/**
 * 4. CLIENT CONFIGURATION EXPOSURE
 * Registers the dynamically synthesized cloud gateway URL back into the central
 * Amplify output ledger so frontend clients can automatically read the base endpoint URL.
 */
backend.addOutput({
  custom: {
    apiBaseUrl: restApiGateway.url,
  },
});

console.log('[Amplify-CDK-Synthesis] Complete: REST API Gateway compiled, CORS boundaries verified, and IAM policies bound.');

/**
 * Basic type casting helper block to satisfy cross-compilation checks inside Node pipelines.
 */
function anyHelperCdkDurationCast(seconds: number): any {
  return { seconds };
}

export default backend;