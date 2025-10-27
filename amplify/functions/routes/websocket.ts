import { Router } from 'express';
import expressWs from 'express-ws';
import WebSocket from 'ws';

const router = Router();

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen?encoding=webm&sample_rate=48000&model=nova-2-general&language=en-US&interim_results=true&endpointing=true';


export const setupWebSocketProxy = (wsInstance: expressWs.Instance) => {
  wsInstance.app.ws('/api/websocket', (ws, req) => {
    const deepgramSocket = new WebSocket(DEEPGRAM_URL, {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    });

    deepgramSocket.on('open', () => {
      console.log('Connected to Deepgram');
    });

    deepgramSocket.on('message', (message) => {
      ws.send(message.toString());
    });

    deepgramSocket.on('close', () => {
      console.log('Disconnected from Deepgram');
      ws.close();
    });

    deepgramSocket.on('error', (error) => {
      console.error('Deepgram error:', error);
      ws.close();
    });

    ws.on('message', (message) => {
      if (deepgramSocket.readyState === WebSocket.OPEN) {
        deepgramSocket.send(message);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      if (deepgramSocket.readyState === WebSocket.OPEN) {
        deepgramSocket.close();
      }
    });
  });
};

export default router;
