import { defineBackend } from '@aws-amplify/backend';
import { apiFunction } from './api/resource';
import { auth } from './auth/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { secret } from '@aws-amplify/backend';

const backend = defineBackend({
auth,
apiFunction,
});

// API Gateway integration
const api = new apigateway.RestApi(backend.stack, 'RestApi', {
restApiName: 'myRestApi',
});

const lambdaIntegration = new apigateway.LambdaIntegration(
backend.apiFunction.resources.lambda
);

api.root.addProxy({
  defaultIntegration: lambdaIntegration,
  anyMethod: true,
  defaultMethodOptions: {
    authorizationType: apigateway.AuthorizationType.IAM,
  },
});

// Policies
backend.apiFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
    resources: ['*'],
  })
);

backend.apiFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['polly:SynthesizeSpeech'],
    resources: ['*'],
  })
);

// Environment variables
backend.apiFunction.addEnvironment('SUPABASE_URL', secret('SUPABASE_URL'));
backend.apiFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.apiFunction.addEnvironment('DEEPGRAM_API_KEY', secret('DEEPGRAM_API_KEY'));
backend.apiFunction.addEnvironment('API_KEY', secret('API_KEY'));

// Output
backend.addOutput({
  custom: { API_URL: api.url },
});