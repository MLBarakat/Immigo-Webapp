export class StreamAudioManager {
  private audioContext: AudioContext;
private audioQueue: ArrayBuffer[] = [];
private isPlaying = false;
private onended: (() => void) | null = null;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.resumeAudioContext();
  }

  public setOnEnded(callback: () => void) {
    this.onended = callback;
  }

  private async resumeAudioContext() {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  public addChunk(base64Data: string) {
    this.resumeAudioContext();
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    this.audioQueue.push(bytes.buffer);
    if (!this.isPlaying) {
      this.playQueue();
    }
  }

  private async playQueue() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      if (this.onended) {
        this.onended();
      }
      return;
    }

    this.isPlaying = true;
    const buffer = this.audioQueue.shift();
    if (buffer) {
      try {
        const audioBuffer = await this.audioContext.decodeAudioData(buffer.slice(0));
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);
        source.onended = () => this.playQueue();
        source.start();
      } catch (error) {
        console.error('Error decoding audio data:', error);
        this.playQueue();
      }
    }
  }

  public stop() {
    this.audioQueue = [];
    this.isPlaying = false;
  }
}

// Replaces SpeechRecognitionManager
export class DeepgramManager {
  private socket: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private onTranscriptCallback: (transcript: string) => void = () => {};
  private onErrorCallback: (error: string) => void = () => {};

  public async startListening(
    onTranscript: (transcript: string) => void,
    onError: (error: string) => void
  ) {
    this.onTranscriptCallback = onTranscript;
    this.onErrorCallback = onError;

    try {
      // Establish WebSocket connection to the backend server
      this.socket = new WebSocket('ws://localhost:3001'); // Ensure this URL is correct for your setup

      this.socket.onopen = async () => {
        console.log('WebSocket connection opened.');

        // Get microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Setup MediaRecorder
        this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(event.data);
          }
        };

        this.mediaRecorder.start(250); // Start recording and send data every 250ms
        console.log('MediaRecorder started.');
      };

      this.socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'transcript' && message.data) {
          this.onTranscriptCallback(message.data);
        }
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.onErrorCallback('WebSocket connection error.');
      };

      this.socket.onclose = () => {
        console.log('WebSocket connection closed.');
        this.stopListening();
      };

    } catch (err) {
      console.error('Error starting microphone:', err);
      this.onErrorCallback('Could not access the microphone.');
    }
  }

  public stopListening() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
      console.log('MediaRecorder stopped.');
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}