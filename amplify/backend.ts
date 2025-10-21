import { defineBackend } from '@aws-amplify/backend';
import { conversationFunction, analyzeFunction, utilityFunction } from './api/resources';
import { auth } from './auth/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import { Duration, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
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
  description: 'ImmiGO API Gateway - Handles requests for voice assistant functionalities',
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

// Configure CloudWatch monitoring for scaling
const monitorFunction = (lambda: any, name: string, thresholds: { concurrent: number, error: number }) => {
  // Create CloudWatch alarm for concurrent executions
  new cloudwatch.Alarm(backend.stack, `${name}ConcurrentAlarm`, {
    metric: new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'ConcurrentExecutions',
      dimensionsMap: { FunctionName: lambda.functionArn.split(':').pop() },
      period: Duration.minutes(1),
      statistic: 'Maximum'
    }),
    threshold: thresholds.concurrent,
    evaluationPeriods: 2,
    datapointsToAlarm: 2,
    alarmDescription: `High concurrency alert for ${name}`,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
  });

  // Create CloudWatch alarm for errors
  new cloudwatch.Alarm(backend.stack, `${name}ErrorAlarm`, {
    metric: new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Errors',
      dimensionsMap: { FunctionName: lambda.functionArn.split(':').pop() },
      period: Duration.minutes(1),
      statistic: 'Sum'
    }),
    threshold: thresholds.error,
    evaluationPeriods: 1,
    alarmDescription: `Error rate alert for ${name}`,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
  });
};

// Set up monitoring for each function with appropriate thresholds
monitorFunction(
  backend.conversationFunction.resources.lambda,
  'Conversation',
  { concurrent: 80, error: 5 }  // High concurrency, low error tolerance
);

monitorFunction(
  backend.analyzeFunction.resources.lambda,
  'Analysis',
  { concurrent: 50, error: 10 } // Medium concurrency, medium error tolerance
);

monitorFunction(
  backend.utilityFunction.resources.lambda,
  'Utility',
  { concurrent: 30, error: 5 }  // Lower concurrency, low error tolerance
);

// Add outputs for monitoring
new CfnOutput(backend.stack, 'ConversationFunctionName', {
  value: backend.conversationFunction.resources.lambda.functionArn.split(':').pop() || '',
  description: 'Name of the conversation Lambda function'
});

new CfnOutput(backend.stack, 'AnalyzeFunctionName', {
  value: backend.analyzeFunction.resources.lambda.functionArn.split(':').pop() || '',
  description: 'Name of the analyze Lambda function'
});

new CfnOutput(backend.stack, 'UtilityFunctionName', {
  value: backend.utilityFunction.resources.lambda.functionArn.split(':').pop() || '',
  description: 'Name of the utility Lambda function'
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