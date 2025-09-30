import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { myApiFunction } from './functions/resource';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { secret } from '@aws-amplify/backend';

const backend = defineBackend({
auth,
myApiFunction,
});

// API Gateway integration
const api = new apigateway.RestApi(backend.stack, 'RestApi', {
restApiName: 'myRestApi',
});

const lambdaIntegration = new apigateway.LambdaIntegration(
backend.myApiFunction.resources.lambda
);

api.root.addProxy({
  defaultIntegration: lambdaIntegration,
  anyMethod: true,
  defaultMethodOptions: {
    authorizationType: apigateway.AuthorizationType.IAM,
  },
});

// Permissions
backend.myApiFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
    resources: ['*'],
  })
);

backend.myApiFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['polly:SynthesizeSpeech'],
    resources: ['*'],
  })
);

// Secrets
backend.myApiFunction.addEnvironment('SUPABASE_URL', secret('SUPABASE_URL'));
backend.myApiFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.myApiFunction.addEnvironment('DEEPGRAM_API_KEY', secret('DEEPGRAM_API_KEY'));
backend.myApiFunction.addEnvironment('API_KEY', secret('API_KEY'));

// Output API URL
backend.addOutput({
  custom: {
    API_URL: api.url,
  },
});