# Voice AI Conversation Application

A high-performance, low-latency web application that enables natural voice conversations with AI, targeting sub-800ms voice-to-voice latency with support for interruptions (barge-in) and session control.

## Features

- **Real-time Voice Conversation**: Natural back-and-forth voice interactions with AI
- **Sub-800ms Latency**: Optimized streaming architecture for minimal response time
- **Barge-in Support**: Interrupt AI responses by speaking
- **Session Management**: Smart conversation control with "stop" command detection
- **Error Handling**: Graceful degradation and comprehensive error management
- **Security**: Rate limiting, input sanitization, and API key authentication
- **Observability**: Structured logging and performance metrics

## Architecture

### Frontend (React + TypeScript)
- **State Management**: React Context + useReducer for centralized state
- **Audio Input**: Web Speech API for real-time speech recognition
- **Audio Output**: Web Audio API for low-latency audio playback
- **UI Components**: Modern chat interface with status indicators

### Backend (Node.js + Express)
- **Streaming Architecture**: Unified endpoint with response streaming
- **AWS Integration**: Bedrock for AI responses, Polly for text-to-speech
- **Security**: Helmet, CORS, rate limiting, input sanitization
- **Monitoring**: Structured JSON logging with request tracking

## Quick Start

### Prerequisites
- Node.js 18+ 
- AWS Account with Bedrock and Polly access
- AWS credentials configured

### Setup

1. **Clone and Install Dependencies**
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install
```

2. **Environment Configuration**
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your AWS credentials and API keys
```

3. **AWS IAM Permissions**
Ensure your AWS credentials have these permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*:*:model/anthropic.claude-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "polly:SynthesizeSpeech"
      ],
      "Resource": "*"
    }
  ]
}
```

4. **Start Development Servers**
```bash
# Start backend (Terminal 1)
cd server && npm run dev

# Start frontend (Terminal 2)
npm run dev
```

5. **Access Application**
Open http://localhost:5173 in your browser

## Usage

1. **Start Conversation**: Click "Start Conversation" to begin
2. **Speak Naturally**: The app will listen and respond with voice
3. **Interrupt AI**: Speak while AI is talking to barge-in
4. **End Session**: Say "stop" alone or click "End Conversation"

## Configuration

### Environment Variables

**Frontend (.env)**
```env
VITE_API_URL=http://localhost:3001
```

**Backend (.env)**
```env
PORT=3001
NODE_ENV=development
SUPABASE_API_KEY=your-secure-api-key
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
CORS_ORIGIN=http://localhost:5173
```

### Audio Settings
- **Speech Recognition**: Continuous listening with interim results
- **Voice Synthesis**: Standard voice (Joanna) via AWS Polly
- **Audio Format**: MP3 encoding for optimal streaming

## Performance Optimization

### Latency Reduction Strategies
1. **Streaming Responses**: Real-time token streaming from Bedrock
2. **Parallel Processing**: Simultaneous TTS generation during text streaming
3. **Audio Buffering**: Optimized audio decoding and playback
4. **Request Pipelining**: Minimal overhead between conversation turns

### Monitoring
The application logs structured JSON for monitoring:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "uuid",
  "event": "conversation_complete",
  "metrics": {
    "totalLatency": 650,
    "bedrockLatency": 400,
    "ttsLatency": 200
  }
}
```

## Security Features

- **Rate Limiting**: 20 requests/minute per IP
- **Input Sanitization**: Prevents prompt injection attacks
- **API Authentication**: Bearer token validation
- **CORS Protection**: Configurable origin restrictions
- **Error Masking**: Prevents information leakage in error responses

## Deployment

### Production Checklist
- [ ] Set strong API keys and JWT secrets
- [ ] Configure AWS IAM roles (recommended over access keys)
- [ ] Set up SSL/TLS certificates
- [ ] Configure monitoring and alerting
- [ ] Set appropriate CORS origins
- [ ] Enable request logging and metrics collection

### Docker Deployment (Optional)
```dockerfile
# Dockerfile example for backend
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

## Troubleshooting

### Common Issues

**Microphone Access Denied**
- Ensure HTTPS in production (required for microphone access)
- Check browser permissions for microphone

**High Latency**
- Verify AWS region proximity
- Check network connectivity to AWS services
- Monitor CloudWatch metrics for Bedrock/Polly performance

**Audio Playback Issues**
- Ensure user interaction before audio playback (browser policy)
- Check audio codec support in browser

### Debug Mode
Set `NODE_ENV=development` for detailed logging and error messages.

## API Reference

### POST /api/conversation
Process user message and return AI response with audio.

**Request:**
```json
{
  "message": "Hello, how are you?",
  "conversationHistory": [
    {
      "role": "user",
      "content": "Previous message",
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Response:**
```json
{
  "responseText": "I'm doing well, thank you for asking!",
  "responseAudio": "base64-encoded-mp3-audio"
}
```

### GET /health
Health check endpoint for monitoring.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## License

MIT License - see LICENSE file for details.