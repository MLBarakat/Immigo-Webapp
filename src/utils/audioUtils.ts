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
                const audioBuffer = await this.audioContext.decodeAudioData(buffer.slice(0)); // Use slice(0) to create a copy
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.audioContext.destination);
                source.onended = () => this.playQueue();
                source.start();
            } catch (error) {
                console.error('Error decoding audio data:', error);
                this.playQueue(); // Try the next chunk
            }
        }
    }

    public stop() {
        // In a real implementation, you'd want to stop the current source
        this.audioQueue = [];
        this.isPlaying = false;
    }
}


export class SpeechRecognitionManager {
  private recognition: SpeechRecognition | null = null;
  private isListening = false;
  private onResultCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onEndCallback: (() => void) | null = null;

  constructor() {
    this.initializeSpeechRecognition();
  }

  private initializeSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('Speech recognition not supported');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      const results = Array.from(event.results);
      const lastResult = results[results.length - 1];
      
      if (this.onResultCallback && lastResult) {
        const transcript = lastResult[0].transcript;
        const isFinal = lastResult.isFinal;
        this.onResultCallback(transcript, isFinal);
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (this.onErrorCallback) {
        this.onErrorCallback(event.error);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onEndCallback) {
        this.onEndCallback();
      }
    };
  }

  startListening(
    onResult: (text: string, isFinal: boolean) => void,
    onError: (error: string) => void,
    onEnd: () => void
  ) {
    if (!this.recognition) {
      onError('Speech recognition not available');
      return;
    }

    if (this.isListening) {
      this.stopListening();
    }

    this.onResultCallback = onResult;
    this.onErrorCallback = onError;
    this.onEndCallback = onEnd;

    try {
      this.recognition.start();
      this.isListening = true;
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      onError('Failed to start speech recognition');
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  isCurrentlyListening() {
    return this.isListening;
  }
}