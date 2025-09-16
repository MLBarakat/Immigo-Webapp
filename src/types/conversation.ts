export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

export type AppStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';