import { defineBackend } from '@aws-amplify/backend';
import { apiFunction } from './api/resource';
import { auth } from './auth/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Duration } from 'aws-cdk-lib';
import { secret } from '@aws-amplify/backend';

const backend = defineBackend({
auth,
apiFunction,
});

// API Gateway integration
const api = new apigateway.RestApi(backend.stack, 'RestApi', {
  restApiName: 'immigo-api',
  description: 'API for ImmiGO - handles conversations, settings, and audio streaming',
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
});

const lambdaIntegration = new apigateway.LambdaIntegration(
  backend.apiFunction.resources.lambda,
  {
    proxy: true,
    allowTestInvoke: true,
    timeout: Duration.seconds(29), // Lambda max is 30s
    integrationResponses: [
      {
        statusCode: '200',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': "'*'",
        },
      },
      {
        selectionPattern: '.*ERROR.*',
        statusCode: '500',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': "'*'",
        },
      },
    ],
  }
);

api.root.addProxy({
  defaultIntegration: lambdaIntegration,
  anyMethod: true,
  defaultMethodOptions: {
    authorizationType: apigateway.AuthorizationType.IAM,
    methodResponses: [
      {
        statusCode: '200',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': true,
        },
      },
      {
        statusCode: '500',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': true,
        },
      },
    ],
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
  custom: { 
    API_URL: api.url,
    API_ENDPOINT: `${api.url}api`
  },
});