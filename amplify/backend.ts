import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { myApiFunction } from './functions/resource';

const backend = defineBackend({
auth,
myApiFunction,
});

// Grant the Lambda function permissions to access AWS services
const bedrockPolicy = new PolicyStatement({
actions: [
'bedrock:InvokeModel',
'bedrock:InvokeModelWithResponseStream',
],
resources: ['*'], // Best practice: Restrict to specific model ARNs in production
});

const pollyPolicy = new PolicyStatement({
actions: ['polly:SynthesizeSpeech'],
resources: ['*'],
});

backend.myApiFunction.resources.lambda.addToRolePolicy(bedrockPolicy);
backend.myApiFunction.resources.lambda.addToRolePolicy(pollyPolicy);

// Create an API Gateway that proxies all requests to the Lambda function
const api = backend.resources.restApi;
api.addProxy({
  path: '/api/{proxy+}',
  integration: backend.myApiFunction.resources.lambda.getHttpIntegration(),
});

// Pass environment variables to the Lambda function
backend.myApiFunction.addEnvironment('SUPABASE_URL', process.env.SUPABASE_URL);
backend.myApiFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
backend.myApiFunction.addEnvironment('DEEPGRAM_API_KEY', process.env.DEEPGRAM_API_KEY);
backend.myApiFunction.addEnvironment('API_KEY', process.env.API_KEY);