import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { myApiFunction } from './functions/resource';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { secret } from '@aws-amplify/backend';

const backend = defineBackend({
auth,
myApiFunction,
});

// Create a new API Gateway REST API resource
const api = new apigateway.RestApi(backend.stack, 'RestApi', {
restApiName: 'myRestApi',
});

// Create a Lambda integration from our function
const lambdaIntegration = new apigateway.LambdaIntegration(backend.myApiFunction.resources.lambda);

// Add a proxy route that forwards all requests under /api/* to the Lambda
api.root.addProxy({
  defaultIntegration: lambdaIntegration,
  anyMethod: true,
  defaultMethodOptions: {
    authorizationType: apigateway.AuthorizationType.IAM,
  },
});

// Grant the Lambda function permissions to access AWS services
const bedrockPolicy = new PolicyStatement({
  actions: [
    'bedrock:InvokeModel',
    'bedrock:InvokeModelWithResponseStream',
  ],
  resources: ['*'],
});
backend.myApiFunction.resources.lambda.addToRolePolicy(bedrockPolicy);

const pollyPolicy = new PolicyStatement({
  actions: ['polly:SynthesizeSpeech'],
  resources: ['*'],
});
backend.myApiFunction.resources.lambda.addToRolePolicy(pollyPolicy);

// Pass the secrets to the Lambda function's environment
backend.myApiFunction.addEnvironment('SUPABASE_URL', secret('SUPABASE_URL'));
backend.myApiFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.myApiFunction.addEnvironment('DEEPGRAM_API_KEY', secret('DEEPGRAM_API_KEY'));
backend.myApiFunction.addEnvironment('API_KEY', secret('API_KEY'));

// Add the API endpoint URL to the output
backend.addOutput({
  custom: {
    API_URL: api.url,
  }
});