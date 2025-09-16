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

export class SpeechRecognitionManager {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private onResultCallback: (transcript: string, isFinal: boolean) => void = () => {};
  private onErrorCallback: (error: string) => void = () => {};
  private onEndCallback: () => void = () => {};

  constructor() {
    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionImpl) {
      this.recognition = new SpeechRecognitionImpl();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;

      this.recognition.onstart = () => {
        this.isListening = true;
        console.log('Speech recognition started');
      };

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        if (finalTranscript) {
          this.onResultCallback(finalTranscript.trim(), true);
        } else {
          this.onResultCallback(interimTranscript, false);
        }
      };

      this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        this.onErrorCallback(event.error);
        this.isListening = false;
      };

      this.recognition.onend = () => {
        console.log('Speech recognition ended');
        this.isListening = false;
        this.onEndCallback();
      };
    } else {
      console.warn('Speech recognition not supported in this browser.');
    }
  }

  startListening(
    onResult: (transcript: string, isFinal: boolean) => void,
    onError: (error: string) => void,
    onEnd: () => void,
    languageCode: string = 'en-US'
  ) {
    if (this.recognition && !this.isListening) {
      this.onResultCallback = onResult;
      this.onErrorCallback = onError;
      this.onEndCallback = onEnd;
      this.recognition.lang = languageCode;
      this.recognition.start();
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  isCurrentlyListening() {
    return this.isListening;
  }
}