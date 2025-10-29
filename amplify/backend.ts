import { defineBackend } from '@aws-amplify/backend';
import { conversationFunction, analyzeFunction, utilityFunction, configFunction, settingsFunction, historyFunction } from './api/resources';
import { auth } from './auth/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Duration, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { secret } from '@aws-amplify/backend';

// Determine the environment from a build-time environment variable
const nodeEnv = process.env.NODE_ENV;

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
    memorySize: 128,
    timeout: Duration.seconds(5)
  },
  settingsFunction: {
    ...settingsFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'handler.handler',
    memorySize: 256,
    timeout: Duration.seconds(10)
  },
  historyFunction: {
    ...historyFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'handler.handler',
    memorySize: 256,
    timeout: Duration.seconds(10)
  }
});

const api = new apigateway.RestApi(backend.stack, 'RestApi', {
  restApiName: `immigo-gateway-${nodeEnv}`,
  description: `ImmiGO API Gateway - ${nodeEnv}`,
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
  deployOptions: {
    stageName: nodeEnv,
    throttlingRateLimit: 10000,
    throttlingBurstLimit: 5000,
    metricsEnabled: true,
    loggingLevel: apigateway.MethodLoggingLevel.INFO,
  },
});

const monitorFunction = (lambda: lambda.IFunction, name: string, thresholds: { concurrent: number, error: number }) => {
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

const setupAutoScaling = (fn: lambda.IFunction, name: string, config: {
  minCapacity: number,
  maxCapacity: number,
  targetUtilization: number
}) => {
  const version = new lambda.Version(backend.stack, `${name}Version`, {
    lambda: fn,
    removalPolicy: RemovalPolicy.RETAIN
  });

  const alias = new lambda.Alias(backend.stack, `${name}LiveAlias`, {
    aliasName: 'live',
    version
  });

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

const utilityLambda = backend.utilityFunction.resources.lambda;
monitorFunction(utilityLambda, 'Utility', { concurrent: 30, error: 5 });
setupAutoScaling(utilityLambda, 'Utility', {
  minCapacity: 3,
  maxCapacity: 30,
  targetUtilization: 0.65
});

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

const corsIntegrationResponse = {
  'method.response.header.Access-Control-Allow-Origin': "'*'",
  'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,POST,GET,PUT,DELETE'",
  'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
};

const conversationIntegration = new apigateway.LambdaIntegration(backend.conversationFunction.resources.lambda, { proxy: true });
const analyzeIntegration = new apigateway.LambdaIntegration(backend.analyzeFunction.resources.lambda, { proxy: true });
const utilityIntegration = new apigateway.LambdaIntegration(backend.utilityFunction.resources.lambda, { proxy: true });
const configIntegration = new apigateway.LambdaIntegration(backend.configFunction.resources.lambda, { proxy: true });
const settingsIntegration = new apigateway.LambdaIntegration(backend.settingsFunction.resources.lambda, { proxy: true });
const historyIntegration = new apigateway.LambdaIntegration(backend.historyFunction.resources.lambda, { proxy: true });

const corsMethodResponse = {
  'method.response.header.Access-Control-Allow-Origin': true,
  'method.response.header.Access-Control-Allow-Methods': true,
  'method.response.header.Access-Control-Allow-Headers': true
};

const apiRoot = api.root.addResource('api');

const conversation = apiRoot.addResource('conversation');
conversation.addMethod('POST', conversationIntegration, { authorizationType: apigateway.AuthorizationType.NONE, methodResponses: [{ statusCode: '200', responseParameters: corsMethodResponse }] });

const analyze = apiRoot.addResource('analyze');
analyze.addMethod('POST', analyzeIntegration, { authorizationType: apigateway.AuthorizationType.NONE, methodResponses: [{ statusCode: '200', responseParameters: corsMethodResponse }] });

const utility = apiRoot.addResource('utility');
utility.addMethod('ANY', utilityIntegration, { authorizationType: apigateway.AuthorizationType.NONE, methodResponses: [{ statusCode: '200', responseParameters: corsMethodResponse }], requestParameters: { 'method.request.querystring.userId': true } });

const config = apiRoot.addResource('config');
config.addMethod('GET', configIntegration, { authorizationType: apigateway.AuthorizationType.NONE, methodResponses: [{ statusCode: '200' }] });

const settings = apiRoot.addResource('settings');
settings.addMethod('GET', settingsIntegration, { authorizationType: apigateway.AuthorizationType.NONE, methodResponses: [{ statusCode: '200', responseParameters: corsMethodResponse }] });
settings.addMethod('PUT', settingsIntegration, { authorizationType: apigateway.AuthorizationType.NONE, methodResponses: [{ statusCode: '200', responseParameters: corsMethodResponse }] });

const history = apiRoot.addResource('history');
history.addMethod('GET', historyIntegration, { authorizationType: apigateway.AuthorizationType.NONE, methodResponses: [{ statusCode: '200', responseParameters: corsMethodResponse }] });

const bedrockPolicy = new PolicyStatement({ actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'], resources: ['*'] });
const pollyPolicy = new PolicyStatement({ actions: ['polly:SynthesizeSpeech'], resources: ['*'] });

backend.conversationFunction.resources.lambda.addToRolePolicy(bedrockPolicy);
backend.conversationFunction.resources.lambda.addToRolePolicy(pollyPolicy);
backend.analyzeFunction.resources.lambda.addToRolePolicy(bedrockPolicy);

backend.conversationFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.conversationFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));
backend.conversationFunction.addEnvironment('DEEPGRAM_API_KEY', secret('DEEPGRAM_API_KEY'));
backend.conversationFunction.addEnvironment('FUNCTION_TYPE', 'conversation');

backend.analyzeFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.analyzeFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));
backend.analyzeFunction.addEnvironment('FUNCTION_TYPE', 'analyze');

backend.utilityFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.utilityFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));
backend.utilityFunction.addEnvironment('FUNCTION_TYPE', 'utility');

backend.settingsFunction.addEnvironment('SUPABASE_URL', secret('SUPABASE_URL'));
backend.settingsFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.settingsFunction.addEnvironment('FUNCTION_TYPE', 'settings');

backend.historyFunction.addEnvironment('SUPABASE_URL', secret('SUPABASE_URL'));
backend.historyFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.historyFunction.addEnvironment('FUNCTION_TYPE', 'history');

backend.configFunction.addEnvironment('SUPABASE_ANON_KEY', secret('SUPABASE_ANON_KEY'));

backend.addOutput({ custom: { API_URL: api.url, API_ENDPOINT: `${api.url}api` } });
