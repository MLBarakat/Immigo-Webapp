import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from './logger';
import WebSocket from 'ws';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const deepgramURL = process.env.DEEPGRAM_URL || '';
const deepgramAPIKey = process.env.DEEPGRAM_API_KEY || '';

// This is a simple in-memory store. For a scalable production app, you would replace this with DynamoDB.
const connections = new Map<string, WebSocket>();

const getApiGatewayManagementApiClient = (domainName: string, stage: string) => {
  const endpoint = `https://${domainName}/${stage}`;
  logger.debug('Creating API Gateway Management Client', { endpoint });
  return new ApiGatewayManagementApiClient({ endpoint });
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Log all environment variables for debugging purposes
  logger.debug('Dumping all environment variables', { env: process.env });
  const connectionId = event.requestContext.connectionId!;
  const routeKey = event.requestContext.routeKey!;
  const domainName = event.requestContext.domainName!;
  const stage = event.requestContext.stage!;

  const apiGatewayClient = getApiGatewayManagementApiClient(domainName, stage);

  logger.debug(`WebSocket event received`, { routeKey, connectionId });

  try {
    switch (routeKey) {
      case '$connect':
        logger.info(`Client connecting...`, { connectionId });

        const deepgramSocket = new WebSocket(deepgramURL, {
          headers: { Authorization: `Token ${deepgramAPIKey}` },
        });

        deepgramSocket.on('open', () => {
          logger.info('Successfully connected to Deepgram', { connectionId });
        });

        deepgramSocket.on('message', async (message) => {
          logger.debug('Received message from Deepgram, forwarding to client', { connectionId });
          try {
            await apiGatewayClient.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: message.toString() }));
          } catch (e: any) {
            // 410 GoneException means the client has already disconnected.
            if (e.name === 'GoneException') {
              logger.warn('Client connection gone. Closing Deepgram socket.', { connectionId });
              deepgramSocket.close();
              connections.delete(connectionId);
            } else {
              logger.error('Failed to send message to client', e, { connectionId });
            }
          }
        });

        deepgramSocket.on('close', (code, reason) => {
          logger.info('Deepgram connection closed', { connectionId, code, reason: reason.toString() });
        });

        deepgramSocket.on('error', (error) => {
          logger.error('Deepgram socket error', error, { connectionId });
        });

        connections.set(connectionId, deepgramSocket);
        break;

      case '$disconnect':
        logger.info(`Client disconnecting`, { connectionId });
        const socketToClose = connections.get(connectionId);
        if (socketToClose && socketToClose.readyState === WebSocket.OPEN) {
          socketToClose.close();
        }
        connections.delete(connectionId);
        break;

      case '$default':
        logger.debug(`Received message from client, forwarding to Deepgram`, { connectionId });
        const deepgramSocketForMessage = connections.get(connectionId);
        if (deepgramSocketForMessage && deepgramSocketForMessage.readyState === WebSocket.OPEN) {
          if (event.body) {
            deepgramSocketForMessage.send(event.body);
          } else {
            logger.warn('Received an empty message from client.', { connectionId });
          }
        } else {
          logger.warn('Received message for a connection with no active Deepgram socket.', { connectionId });
        }
        break;

      default:
        logger.warn(`Received unknown routeKey`, { routeKey, connectionId });
    }

    return { statusCode: 200, body: 'Ok' };

  } catch (error) {
    logger.error('An error occurred in the WebSocket handler', error as Error, { connectionId, routeKey });
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};
