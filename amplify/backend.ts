import { defineBackend } from '@aws-amplify/backend';
import { conversationFunction, analyzeFunction, utilityFunction, configFunction } from './api/resources';
import { auth } from './auth/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Duration, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
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
  conversationFunction: {
    ...conversationFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'handler.handler',
    memorySize: 1024,
    timeout: Duration.seconds(30)
  },
  analyzeFunction: {
    ...analyzeFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'handler.handler',
    memorySize: 512,
    timeout: Duration.seconds(30)
  },
  utilityFunction: {
    ...utilityFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'handler.handler',
    memorySize: 256,
    timeout: Duration.seconds(10)
  },
  configFunction: {
    ...configFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'handler.handler',
    memorySize: 128, // Smallest size for a simple function
    timeout: Duration.seconds(5)
  }
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
const monitorFunction = (lambda: lambda.IFunction, name: string, thresholds: { concurrent: number, error: number }) => {
  // Create CloudWatch alarm for concurrent executions
  new cloudwatch.Alarm(backend.stack, `${name}ConcurrentAlarm`, {
    metric: new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'ConcurrentExecutions',
      dimensionsMap: { FunctionName: lambda.functionArn.split(':').pop() ?? '' },
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
      dimensionsMap: { FunctionName: lambda.functionArn.split(':').pop() ?? '' },
      period: Duration.minutes(1),
      statistic: 'Sum'
    }),
    threshold: thresholds.error,
    evaluationPeriods: 1,
    alarmDescription: `Error rate alert for ${name}`,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
  });
};

// Configure auto-scaling for Lambda functions
const setupAutoScaling = (fn: lambda.IFunction, name: string, config: {
  minCapacity: number,
  maxCapacity: number,
  targetUtilization: number
}) => {
  // Create function version for auto-scaling
  const version = new lambda.Version(backend.stack, `${name}Version`, {
    lambda: fn,
    removalPolicy: RemovalPolicy.RETAIN
  });

  // Create alias with provisioned concurrency
  const alias = new lambda.Alias(backend.stack, `${name}LiveAlias`, {
    aliasName: 'live',
    version
  });

  // Configure provisioned concurrency and auto-scaling on the alias
  const autoScaling = alias.addAutoScaling({ 
    minCapacity: config.minCapacity,
    maxCapacity: config.maxCapacity
  });

  autoScaling.scaleOnUtilization({
    utilizationTarget: config.targetUtilization,
    scaleInCooldown: Duration.seconds(60),
    scaleOutCooldown: Duration.seconds(30)
  });
};

// Set up monitoring and auto-scaling for each function
const conversationLambda = backend.conversationFunction.resources.lambda;
monitorFunction(conversationLambda, 'Conversation', { concurrent: 80, error: 5 });
setupAutoScaling(conversationLambda, 'Conversation', {
  minCapacity: 10,
  maxCapacity: 100,
  targetUtilization: 0.75
});

const analyzeLambda = backend.analyzeFunction.resources.lambda;
monitorFunction(analyzeLambda, 'Analysis', { concurrent: 50, error: 10 });
setupAutoScaling(analyzeLambda, 'Analysis', {
  minCapacity: 5,
  maxCapacity: 50,
  targetUtilization: 0.70
});

// Set up monitoring and scaling for utility function
const utilityLambda = backend.utilityFunction.resources.lambda;
monitorFunction(utilityLambda, 'Utility', { concurrent: 30, error: 5 });
setupAutoScaling(utilityLambda, 'Utility', {
  minCapacity: 3,
  maxCapacity: 30,
  targetUtilization: 0.65
});

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

// Common integration response parameters for CORS
const corsIntegrationResponse = {
  'method.response.header.Access-Control-Allow-Origin': "'*'",
  'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,POST,GET,PUT,DELETE'",
  'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
};

// Conversation endpoints (high memory)
const conversationIntegration = new apigateway.LambdaIntegration(
  backend.conversationFunction.resources.lambda,
  {
    proxy: true,
    allowTestInvoke: true,
    requestTemplates: {
      'application/json': '{ "statusCode": 200 }'
    },
    integrationResponses: [{
      statusCode: '200',
      responseParameters: corsIntegrationResponse,
      responseTemplates: {
        'application/json': '$input.json("$")'
      }
    }]
  }
);

// Analysis endpoints (medium memory)
const analyzeIntegration = new apigateway.LambdaIntegration(
  backend.analyzeFunction.resources.lambda,
  {
    proxy: true,
    allowTestInvoke: true,
    requestTemplates: {
      'application/json': '{ "statusCode": 200 }'
    },
    integrationResponses: [{
      statusCode: '200',
      responseParameters: corsIntegrationResponse,
      responseTemplates: {
        'application/json': '$input.json("$")'
      }
    }]
  }
);

// Utility endpoints (low memory)
const utilityIntegration = new apigateway.LambdaIntegration(
  backend.utilityFunction.resources.lambda,
  {
    proxy: true,
    allowTestInvoke: true,
    requestTemplates: {
      'application/json': '{ "statusCode": 200 }'
    },
    integrationResponses: [{
      statusCode: '200',
      responseParameters: corsIntegrationResponse,
      responseTemplates: {
        'application/json': '$input.json("$")'
      }
    }]
  }
);

// Config endpoint (very low memory, public access)
const configIntegration = new apigateway.LambdaIntegration(
  backend.configFunction.resources.lambda,
  {
    proxy: true,
    allowTestInvoke: true,
  }
);

// Common method response parameters for CORS
const corsMethodResponse = {
  'method.response.header.Access-Control-Allow-Origin': true,
  'method.response.header.Access-Control-Allow-Methods': true,
  'method.response.header.Access-Control-Allow-Headers': true
};

// Route configurations
const conversation = api.root.addResource('conversation');
conversation.addMethod('POST', conversationIntegration, {
  authorizationType: apigateway.AuthorizationType.NONE,
  methodResponses: [{
    statusCode: '200',
    responseParameters: corsMethodResponse
  }]
});

const analyze = api.root.addResource('analyze');
analyze.addMethod('POST', analyzeIntegration, {
  authorizationType: apigateway.AuthorizationType.NONE,
  methodResponses: [{
    statusCode: '200',
    responseParameters: corsMethodResponse
  }]
});

const utility = api.root.addResource('utility');
utility.addMethod('ANY', utilityIntegration, {
  authorizationType: apigateway.AuthorizationType.NONE,
  methodResponses: [{
    statusCode: '200',
    responseParameters: corsMethodResponse
  }],
  requestParameters: {
    'method.request.querystring.userId': true,
  }
});

// Config route
const config = api.root.addResource('config');
config.addMethod('GET', configIntegration, {
  // This endpoint is public, so no authorization
  authorizationType: apigateway.AuthorizationType.NONE,
  methodResponses: [{
    statusCode: '200'
  }]
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
backend.conversationFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));
backend.conversationFunction.addEnvironment('DEEPGRAM_API_KEY', secret('DEEPGRAM_API_KEY'));
backend.conversationFunction.addEnvironment('FUNCTION_TYPE', 'conversation');

// Add environment variables to analyze function
backend.analyzeFunction.addEnvironment('SUPABASE_URL', secret('SUPABASE_URL'));
backend.analyzeFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.analyzeFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));
backend.analyzeFunction.addEnvironment('FUNCTION_TYPE', 'analyze');

// Add environment variables to utility function
backend.utilityFunction.addEnvironment('SUPABASE_URL', secret('SUPABASE_URL'));
backend.utilityFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.utilityFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));
backend.utilityFunction.addEnvironment('FUNCTION_TYPE', 'utility');

// Add environment variables to config function
backend.configFunction.addEnvironment('SUPABASE_URL', secret('SUPABASE_URL'));
// Note: We are using the 'SUPABASE_API_KEY' secret for the public 'anon' key. Ensure this is the correct public key.
backend.configFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));

// Output
backend.addOutput({
  custom: { 
    API_URL: api.url,
    API_ENDPOINT: `${api.url}api`
  },
});