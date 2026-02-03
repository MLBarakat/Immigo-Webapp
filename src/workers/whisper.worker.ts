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

// Inference bookkeeping to support cancellation, de-dup, and latency measurement
let _currentInferenceId = 0;
const _lastReported: Record<number, string> = {};
const _speechEndTimestamps: Record<number, number> = {};
const _inferenceStartTimes: Record<number, number> = {};

// Default ASR tuning parameters (seconds). These can be overridden by the main thread
let _chunkLengthS = 8;
let _strideLengthS = 1;

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
            // Allow the main thread to send ASR tuning values when loading
            const cfg = event.data?.config ?? {};
            if (typeof cfg.chunk_length_s === 'number') _chunkLengthS = cfg.chunk_length_s;
            if (typeof cfg.stride_length_s === 'number') _strideLengthS = cfg.stride_length_s;
            if (cfg && (cfg.chunk_length_s || cfg.stride_length_s)) {
                self.postMessage({ status: 'config-updated', chunk_length_s: _chunkLengthS, stride_length_s: _strideLengthS });
            }

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
    // Allow runtime updates to ASR configuration
    if (action === 'set-config') {
        try {
            const cfg = event.data?.config ?? {};
            if (typeof cfg.chunk_length_s === 'number') _chunkLengthS = cfg.chunk_length_s;
            if (typeof cfg.stride_length_s === 'number') _strideLengthS = cfg.stride_length_s;
            self.postMessage({ status: 'config-updated', chunk_length_s: _chunkLengthS, stride_length_s: _strideLengthS });
        } catch (e) {
            // ignore
        }
        return;
    }
    // Mark the end of a user's speech segment so we can measure latency from speech end -> complete
    if (action === 'speech_end') {
        try {
            const ts = event.data.timestamp ?? Date.now();
            // Associate the speech end timestamp with the current inference id so we can calculate latency
            _speechEndTimestamps[_currentInferenceId] = ts;
            self.postMessage({ status: 'speech-end-ack', inferenceId: _currentInferenceId, timestamp: ts });
        } catch (e) {
            // ignore
        }
        return;
    }

    if (action === 'transcribe') {
        try {
            // Emit an explicit log so the main thread can confirm receipt of audio
            self.postMessage({ status: 'log', message: `Received transcribe request (audio length: ${audio?.length ?? 0})` });
            const transcriber = await WhisperPipeline.getInstance(); // Should be loaded now
            if (!transcriber || !audio) {
                self.postMessage({ status: 'error', error: 'Transcription service is not ready or audio is missing.' });
                return;
            }

            // Start a new inference and bump the id so older inferences get ignored
            const inferenceId = ++_currentInferenceId;
            _lastReported[inferenceId] = '';
            _inferenceStartTimes[inferenceId] = Date.now();
            self.postMessage({ status: 'inference-start', inferenceId });

            // The VAD provides audio as a Float32Array, which is what the model expects.
            const output = await transcriber(audio, {
                // Use configured chunk/stride (seconds)
                chunk_length_s: _chunkLengthS,
                stride_length_s: _strideLengthS,
                callback_function: (beams: any[]) => {
                    const bestBeam = beams && beams[0];
                    if (!bestBeam) return;

                    // Normalize whitespace and trim to avoid tiny repeated fragments
                    const normalized = (bestBeam.text || '').replace(/\s+/g, ' ').trim();

                    // Only report updates for the latest active inference and when text actually changed
                    if (inferenceId === _currentInferenceId && normalized && normalized !== _lastReported[inferenceId]) {
                        _lastReported[inferenceId] = normalized;
                        self.postMessage({ status: 'update', output: normalized, inferenceId });
                    }
                }
            });

            // If this inference is no longer the active one, treat it as cancelled/ignored
            if (inferenceId !== _currentInferenceId) {
                self.postMessage({ status: 'cancelled', inferenceId });
                return;
            }

            if (output && typeof output.text === 'string') {
                 const finalText = (output.text || '').replace(/\s+/g, ' ').trim();
                 self.postMessage({ status: 'complete', output: finalText, inferenceId });

                 const speechEndTs = _speechEndTimestamps[inferenceId];
                 if (speechEndTs) {
                     const latencyMs = Date.now() - speechEndTs;
                     self.postMessage({ status: 'latency', inferenceId, latencyMs });
                 }
            }
        } catch (error) {
            self.postMessage({ status: 'error', error: `Transcription failed: ${error}` });
        }
    }

    // Handle partial/streaming transcribe calls that should produce interim updates
    if (action === 'transcribe-partial') {
        try {
            self.postMessage({ status: 'log', message: `Received partial transcribe request (audio length: ${audio?.length ?? 0})` });

            // Simple guard to avoid overlapping partial inferences
            if ((self as any)._partialInProgress) {
                // Ignore overlapping partial requests to keep inference throughput manageable
                self.postMessage({ status: 'log', message: 'Skipping overlapping partial transcribe' });
                return;
            }

            (self as any)._partialInProgress = true;

            const transcriber = await WhisperPipeline.getInstance();
            if (!transcriber || !audio) {
                self.postMessage({ status: 'log', message: 'Partial transcriber not available or audio missing' });
                (self as any)._partialInProgress = false;
                return;
            }

            // Use a short chunk/stride for quicker interim updates
            await transcriber(audio, {
                chunk_length_s: Math.min(2, _chunkLengthS),
                stride_length_s: Math.min(0.5, _strideLengthS),
                callback_function: (beams: any[]) => {
                    const bestBeam = beams && beams[0];
                    if (!bestBeam) return;
                    const normalized = (bestBeam.text || '').replace(/\s+/g, ' ').trim();

                    // Report partial updates without assigning a new inference id
                    if (normalized) {
                        // Avoid flooding by de-duping partial text
                        if ((self as any)._lastPartialReported !== normalized) {
                            (self as any)._lastPartialReported = normalized;
                            self.postMessage({ status: 'update', output: normalized, inferenceId: null });
                        }
                    }
                }
            });

            (self as any)._partialInProgress = false;
        } catch (error) {
            (self as any)._partialInProgress = false;
            self.postMessage({ status: 'log', message: `Partial transcribe failed: ${error}` });
        }
    }
};
