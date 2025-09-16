// Ensure SpeechRecognition types are available globally or imported
// This is usually handled by 'dom.speechRecognition' in tsconfig.json 'lib' array
declare global {
  interface Window {
    webkitSpeechRecognition: typeof SpeechRecognition;
}
}

type SpeechRecognitionCallback = (transcript: string, isFinal: boolean) => void;
type SpeechRecognitionErrorCallback = (error: string) => void;
type SpeechRecognitionEndCallback = () => void;

export class SpeechRecognitionManager {
private recognition: SpeechRecognition | null = null;
private onResultCallback: SpeechRecognitionCallback = () => {};
private onErrorCallback: SpeechRecognitionErrorCallback = () => {};
private onEndCallback: SpeechRecognitionEndCallback = () => {};

constructor() {
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognitionAPI();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event: SpeechRecognitionEvent) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                if (finalTranscript) {
                    this.onResultCallback(finalTranscript, true);
                } else if (interimTranscript) {
                    this.onResultCallback(interimTranscript, false);
                }
            };

            this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                console.error('Speech Recognition Error:', event.error);
                this.onErrorCallback(event.error);
            };

            this.recognition.onend = () => {
                console.log('Speech Recognition Ended');
                this.onEndCallback();
            };
        } else {
            console.warn('Speech Recognition API not supported in this browser.');
            // Provide a dummy implementation or throw an error if functionality is critical
        }
    }

    public startListening(
        onResult: SpeechRecognitionCallback,
        onError: SpeechRecognitionErrorCallback,
        onEnd: SpeechRecognitionEndCallback
    ) {
        if (this.recognition) {
            this.onResultCallback = onResult;
            this.onErrorCallback = onError;
            this.onEndCallback = onEnd;
            try {
                this.recognition.start();
                console.log('Speech Recognition Started');
            } catch (e) {
                console.error('Error starting speech recognition:', e);
                this.onErrorCallback('Failed to start microphone. Please check permissions.');
            }
        } else {
            this.onErrorCallback('Speech Recognition not supported.');
        }
    }

    public stopListening() {
        if (this.recognition) {
            this.recognition.stop();
            console.log('Speech Recognition Stopped');
        }
    }
}

type AudioChunkCallback = (chunk: string) => void;
type AudioEndedCallback = () => void;

export class StreamAudioManager {
    private audioQueue: string[] = [];
    private audioContext: AudioContext | null = null;
    private isPlaying: boolean = false;
    private onEndedCallback: AudioEndedCallback = () => {};

    constructor() {
        this.initAudioContext();
    }

    private initAudioContext() {
        if (!this.audioContext) {
            // Check if AudioContext is already running from another source
            if (window.AudioContext) {
                this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            } else {
                console.warn('Web Audio API not supported in this browser.');
            }
        }
    }

    public addChunk(base64AudioChunk: string) {
        this.audioQueue.push(base64AudioChunk);
        if (!this.isPlaying) {
            this.playNextChunk();
        }
    }

    public setOnEnded(callback: AudioEndedCallback) {
        this.onEndedCallback = callback;
    }

    private async playNextChunk() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            this.onEndedCallback(); // Call onEnded when queue is empty
            return;
        }

        this.isPlaying = true;
        const chunk = this.audioQueue.shift();
        if (!chunk) {
            this.playNextChunk();
            return;
        }

        try {
            if (!this.audioContext) {
                this.initAudioContext(); // Try to initialize again if null
                if (!this.audioContext) {
                    console.error('AudioContext not available.');
                    this.isPlaying = false;
                    this.onEndedCallback();
                    return;
                }
            }
            const audioData = Uint8Array.from(atob(chunk), c => c.charCodeAt(0)).buffer;
            const buffer = await this.audioContext.decodeAudioData(audioData);
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.onended = () => {
                this.playNextChunk();
            };
            source.start(0);
        } catch (error) {
            console.error('Error playing audio chunk:', error);
            this.playNextChunk(); // Try to play the next chunk even if one fails
        }
    }

    public stop() {
        this.audioQueue = [];
        this.isPlaying = false;
        // Optionally stop currently playing audio if needed, but not directly supported by Web Audio API easily.
        // A more complex implementation involving AudioNodes would be needed.
        if (this.audioContext && this.audioContext.state === 'running') {
          this.audioContext.suspend();
        }
    }

    public resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
        if (!this.isPlaying && this.audioQueue.length > 0) {
            this.playNextChunk();
        }
    }
}