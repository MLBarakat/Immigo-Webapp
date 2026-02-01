// src/workers/whisper.worker.ts

// The transformers library will be imported dynamically
// to avoid bundling issues with Vite in the worker context.

// --- Configuration ---
// Environment settings and pipeline definition are now handled within the getInstance method.

// --- Model and Pipeline definition ---
class WhisperPipeline {
    static task = 'automatic-speech-recognition';
    // Using a multilingual model for broader compatibility
    static model = 'Xenova/whisper-tiny'; 
    static instance: any = null; // Use `any` as the type will be from the dynamic import
    static loadingPromise: Promise<any> | null = null;

    static async getInstance(progress_callback?: (progress: any) => void) {
        if (this.instance === null && this.loadingPromise === null) {
            this.loadingPromise = new Promise(async (resolve, reject) => {
                try {
                    // Dynamically import the transformers library from a CDN.
                    // Use the Vite ignore comment so Vite/Rollup doesn't rewrite or bundle it.
                    // Temporarily silence noisy console output from third-party libs (transformers / onnxruntime)
                    // while we dynamically import and initialize the model. We restore the console afterwards.
                    const _savedConsole = { debug: console.debug, info: console.info, warn: console.warn, log: console.log };
                    const _noop = () => {};

                    try {
                        // Mute console while importing and initializing the model to reduce spam from third-party libs
                        console.debug = _noop; console.info = _noop; console.warn = _noop; console.log = _noop;

                        const { pipeline, env } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1');

                        // --- Environment settings for Transformers.js ---
                        env.allowLocalModels = true;
                        env.allowRemoteModels = true;
                        // By default, it will fetch from the Hugging Face Hub.
                        env.localModelPath = '/models/';

                        // Use a no-op callback when none is provided to satisfy the pipeline API
                        const cb = progress_callback ?? (() => {});
                        
                        this.instance = await pipeline(this.task, this.model, { 
                            progress_callback: cb,
                            // Specify quantization for faster inference and lower memory usage
                            quantized: true, 
                        });
                        resolve(this.instance);
                    } finally {
                        // Restore console methods to avoid hiding important messages later
                        console.debug = _savedConsole.debug;
                        console.info = _savedConsole.info;
                        console.warn = _savedConsole.warn;
                        console.log = _savedConsole.log;
                    }
                } catch (error) {
                    self.postMessage({ status: 'error', error: `Failed to load model: ${error}` });
                    reject(error);
                }
            });
        }
        
        return this.loadingPromise;
    }
}

// --- Message Handler ---
self.postMessage({ status: 'worker-initialized' });

// Catch any synchronous errors that would otherwise be silent inside the worker
self.addEventListener('error', (e: ErrorEvent) => {
    try {
        self.postMessage({ status: 'error', error: `Worker error: ${e.message}` });
    } catch (_) {
        // ignore
    }
});

// Catch unhandled promise rejections
(self as any).addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    try {
        self.postMessage({ status: 'error', error: `Unhandled rejection: ${ev.reason}` });
    } catch (_) {
        // ignore
    }
});

self.onmessage = async (event) => {
    const { action, audio } = event.data;

    if (action === 'load') {
        // Load the model and report progress to the main thread
        try {
            await WhisperPipeline.getInstance(progress => {
                self.postMessage(progress);
            });
            self.postMessage({ status: 'ready' });
        } catch (error) {
            // Error is already posted inside getInstance
        }
        return;
    }

    if (action === 'ping') {
        // Simple handshake for debugging to confirm the worker is alive
        self.postMessage({ status: 'pong' });
        return;
    }

    if (action === 'transcribe') {
        try {
            self.postMessage({ status: 'log', message: `Received transcribe request (audio length: ${audio?.length ?? 0})` });
            const transcriber = await WhisperPipeline.getInstance(); // Should be loaded now
            if (!transcriber || !audio) {
                self.postMessage({ status: 'error', error: 'Transcription service is not ready or audio is missing.' });
                return;
            }

            // The VAD provides audio as a Float32Array, which is what the model expects.
            const output = await transcriber(audio, {
                chunk_length_s: 30,
                stride_length_s: 5,
                callback_function: (beams: any[]) => {
                    const bestBeam = beams[0];
                    if (bestBeam) {
                        self.postMessage({
                            status: 'update',
                            output: bestBeam.text,
                        });
                    }
                }
            });

            if (output && typeof output.text === 'string') {
                 self.postMessage({
                    status: 'complete',
                    output: output.text,
                });
            }
        } catch (error) {
            self.postMessage({ status: 'error', error: `Transcription failed: ${error}` });
        }
    }
};
