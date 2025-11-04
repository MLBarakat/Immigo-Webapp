import { defineBackend } from '@aws-amplify/backend';
import { conversationFunction, analyzeFunction, utilityFunction, configFunction, settingsFunction, historyFunction, webSocketFunction } from './api/resources';
import { auth } from './auth/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Duration, Aws } from 'aws-cdk-lib';
import { secret } from '@aws-amplify/backend';

// Determine the environment from a build-time environment variable to control staging
const nodeEnv = process.env.NODE_ENV || 'DEV';

const backend = defineBackend({
  auth,
  conversationFunction: {
    ...conversationFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'conversation.handler',
    memorySize: 1024,
    timeout: Duration.seconds(30)
  },
  analyzeFunction: {
    ...analyzeFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'analyze.handler',
    memorySize: 512,
    timeout: Duration.seconds(30)
  },
  utilityFunction: {
    ...utilityFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'utility.handler',
    memorySize: 256,
    timeout: Duration.seconds(10)
  },
  configFunction: {
    ...configFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'config.handler',
    memorySize: 128,
    timeout: Duration.seconds(5)
  },
  settingsFunction: {
    ...settingsFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'settings.handler',
    memorySize: 256,
    timeout: Duration.seconds(10)
  },
  historyFunction: {
    ...historyFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'history.handler',
    memorySize: 256,
    timeout: Duration.seconds(10)
  },
  webSocketFunction: {
    ...webSocketFunction,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'websocket.handler',
    memorySize: 512,
    timeout: Duration.seconds(30)
  }
});

// HTTP API Gateway
const gatewayAPI = new apigateway.RestApi(backend.stack, 'Gateway-Api', {
  restApiName: `immigo-gateway-${nodeEnv}`,
  description: `ImmiGO API Gateway - ${nodeEnv}`,
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
    allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
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

// WebSocket API Gateway
const webSocketAPI = new apigatewayv2.WebSocketApi(backend.stack, 'WebSocket-Api', {
  apiName: `immigo-websocket-api-${nodeEnv}`,
  description: `ImmiGO WebSocket API - ${nodeEnv}`,
});

const webSocketStage = new apigatewayv2.WebSocketStage(backend.stack, 'WebSocketStage', {
  webSocketApi: webSocketAPI,
  stageName: nodeEnv,
  autoDeploy: true,
});

const webSocketIntegration = new WebSocketLambdaIntegration('WebSocketIntegration', backend.webSocketFunction.resources.lambda);

webSocketAPI.addRoute('$connect', { integration: webSocketIntegration });
webSocketAPI.addRoute('$disconnect', { integration: webSocketIntegration });
webSocketAPI.addRoute('$default', { integration: webSocketIntegration });

// Grant the WebSocket Lambda function permission to manage connections
const manageConnectionsPolicy = new PolicyStatement({
    actions: ['execute-api:ManageConnections'],
    resources: [`arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${webSocketAPI.apiId}/${nodeEnv}/*`],
});
backend.webSocketFunction.resources.lambda.addToRolePolicy(manageConnectionsPolicy);


// HTTP Integrations
const conversationIntegration = new apigateway.LambdaIntegration(backend.conversationFunction.resources.lambda, { proxy: true });
const analyzeIntegration = new apigateway.LambdaIntegration(backend.analyzeFunction.resources.lambda, { proxy: true });
const utilityIntegration = new apigateway.LambdaIntegration(backend.utilityFunction.resources.lambda, { proxy: true });
const configIntegration = new apigateway.LambdaIntegration(backend.configFunction.resources.lambda, { proxy: true });
const settingsIntegration = new apigateway.LambdaIntegration(backend.settingsFunction.resources.lambda, { proxy: true });
const historyIntegration = new apigateway.LambdaIntegration(backend.historyFunction.resources.lambda, { proxy: true });

const apiRoot = gatewayAPI.root.addResource('api');

// HTTP Routes
apiRoot.addResource('conversation').addMethod('POST', conversationIntegration);
apiRoot.addResource('analyze').addMethod('POST', analyzeIntegration);
apiRoot.addResource('utility').addMethod('ANY', utilityIntegration);
apiRoot.addResource('config').addMethod('GET', configIntegration);
const settingsResource = apiRoot.addResource('settings');
settingsResource.addMethod('GET', settingsIntegration);
settingsResource.addMethod('PUT', settingsIntegration);
apiRoot.addResource('history').addMethod('GET', historyIntegration);

// Policies
const bedrockPolicy = new PolicyStatement({ actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'], resources: ['*'] });
const pollyPolicy = new PolicyStatement({ actions: ['polly:SynthesizeSpeech'], resources: ['*'] });

backend.conversationFunction.resources.lambda.addToRolePolicy(bedrockPolicy);
backend.conversationFunction.resources.lambda.addToRolePolicy(pollyPolicy);
backend.analyzeFunction.resources.lambda.addToRolePolicy(bedrockPolicy);

// Environment Variables
backend.conversationFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.conversationFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));

backend.analyzeFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.analyzeFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));

backend.utilityFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));
backend.utilityFunction.addEnvironment('SUPABASE_API_KEY', secret('SUPABASE_API_KEY'));

backend.settingsFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));

backend.historyFunction.addEnvironment('SUPABASE_SERVICE_ROLE_KEY', secret('SUPABASE_SERVICE_ROLE_KEY'));

backend.configFunction.addEnvironment('SUPABASE_ANON_KEY', secret('SUPABASE_ANON_KEY'));

backend.webSocketFunction.addEnvironment('DEEPGRAM_API_KEY', secret('DEEPGRAM_API_KEY'));

// Outputs
backend.addOutput({
  custom: {
    API_URL: gatewayAPI.url,
    API_ENDPOINT: `${gatewayAPI.url}api`,
    WEBSOCKET_URL: webSocketStage.url,
  },
});
