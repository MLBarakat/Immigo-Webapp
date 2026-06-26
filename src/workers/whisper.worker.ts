// src/workers/whisper.worker.ts

// --- Model and Pipeline Singleton Definition ---
class WhisperPipeline {
    static task = 'automatic-speech-recognition';
    static model = 'Xenova/whisper-tiny';
    static instance: any = null;
    static loadingPromise: Promise<any> | null = null;

    static async getInstance(progress_callback?: (progress: any) => void) {
        if (this.instance === null && this.loadingPromise === null) {
            this.loadingPromise = new Promise(async (resolve, reject) => {
                try {
                    const _savedConsole = { debug: console.debug, info: console.info, warn: console.warn, log: console.log };
                    const _noop = () => { };

                    try {
                        // Mute console while importing and initializing the model to reduce spam from third-party libs
                        console.debug = _noop; console.info = _noop; console.warn = _noop; console.log = _noop;

                        const { pipeline, env } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1');

                        // Environment settings for Transformers.js
                        env.allowLocalModels = true;
                        env.allowRemoteModels = true;
                        env.localModelPath = '/models/';

                        const cb = progress_callback ?? (() => { });

                        this.instance = await pipeline(this.task, this.model, {
                            progress_callback: cb,
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

// Inference bookkeeping tracking arrays
let _currentInferenceId = 0;
const _lastReported: Record<number, string> = {};
const _speechEndTimestamps: Record<number, number> = {};
const _inferenceStartTimes: Record<number, number> = {};

// Default ASR tuning parameters (seconds)
let _chunkLengthS = 8;
let _strideLengthS = 1;

// Default partial (short) inference parameters for low-latency interim updates
let _partialChunkLengthS = 0.8;
let _partialStrideLengthS = 0.2;

// Initial signal handshake to notify main thread
self.postMessage({ status: 'worker-initialized' });

// Global thread exception captures
self.addEventListener('error', (e: ErrorEvent) => {
    try {
        self.postMessage({ status: 'error', error: `Worker error: ${e.message}` });
    } catch (_) { }
});

(self as any).addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    try {
        self.postMessage({ status: 'error', error: `Unhandled rejection: ${ev.reason}` });
    } catch (_) { }
});

self.onmessage = async (event) => {
    const { action, audio } = event.data;

    if (action === 'load') {
        try {
            const cfg = event.data?.config ?? {};
            if (typeof cfg.chunk_length_s === 'number') _chunkLengthS = cfg.chunk_length_s;
            if (typeof cfg.stride_length_s === 'number') _strideLengthS = cfg.stride_length_s;
            if (typeof cfg.partial_chunk_length_s === 'number') _partialChunkLengthS = cfg.partial_chunk_length_s;
            if (typeof cfg.partial_stride_length_s === 'number') _partialStrideLengthS = cfg.partial_stride_length_s;

            if (cfg && (cfg.chunk_length_s || cfg.stride_length_s || cfg.partial_chunk_length_s || cfg.partial_stride_length_s)) {
                self.postMessage({ status: 'config-updated', chunk_length_s: _chunkLengthS, stride_length_s: _strideLengthS, partial_chunk_length_s: _partialChunkLengthS, partial_stride_length_s: _partialStrideLengthS });
            }

            await WhisperPipeline.getInstance(progress => {
                self.postMessage(progress);
            });
            self.postMessage({ status: 'ready' });
        } catch (error) { }
        return;
    }

    if (action === 'ping') {
        self.postMessage({ status: 'pong' });
        return;
    }

    if (action === 'set-config') {
        try {
            const cfg = event.data?.config ?? {};
            if (typeof cfg.chunk_length_s === 'number') _chunkLengthS = cfg.chunk_length_s;
            if (typeof cfg.stride_length_s === 'number') _strideLengthS = cfg.stride_length_s;
            if (typeof cfg.partial_chunk_length_s === 'number') _partialChunkLengthS = cfg.partial_chunk_length_s;
            if (typeof cfg.partial_stride_length_s === 'number') _partialStrideLengthS = cfg.partial_stride_length_s;
            self.postMessage({ status: 'config-updated', chunk_length_s: _chunkLengthS, stride_length_s: _strideLengthS, partial_chunk_length_s: _partialChunkLengthS, partial_stride_length_s: _partialStrideLengthS });
        } catch (e) { }
        return;
    }

    if (action === 'speech_end') {
        try {
            const ts = event.data.timestamp ?? Date.now();
            _speechEndTimestamps[_currentInferenceId] = ts;
            self.postMessage({ status: 'speech-end-ack', inferenceId: _currentInferenceId, timestamp: ts });
        } catch (e) { }
        return;
    }

    if (action === 'transcribe') {
        try {
            self.postMessage({ status: 'log', message: `Received transcribe request (audio length: ${audio?.length ?? 0})` });
            const transcriber = await WhisperPipeline.getInstance();
            if (!transcriber || !audio) {
                self.postMessage({ status: 'error', error: 'Transcription service is not ready or audio is missing.' });
                return;
            }

            const inferenceId = ++_currentInferenceId;
            _lastReported[inferenceId] = '';
            _inferenceStartTimes[inferenceId] = Date.now();
            self.postMessage({ status: 'inference-start', inferenceId });

            const output = await transcriber(audio, {
                chunk_length_s: _chunkLengthS,
                stride_length_s: _strideLengthS,
                callback_function: (beams: any[]) => {
                    const bestBeam = beams && beams[0];
                    if (!bestBeam) return;

                    const normalized = (bestBeam.text || '').replace(/\s+/g, ' ').trim();

                    if (inferenceId === _currentInferenceId && normalized && normalized !== _lastReported[inferenceId]) {
                        _lastReported[inferenceId] = normalized;
                        self.postMessage({ status: 'update', output: normalized, inferenceId });
                    }
                }
            });

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

    if (action === 'transcribe-partial') {
        try {
            const clientSendTs = event.data?.clientSendTs ?? null;
            self.postMessage({ status: 'log', message: `Received partial transcribe request (audio length: ${audio?.length ?? 0})`, clientSendTs });

            if ((self as any)._partialInProgress) {
                self.postMessage({ status: 'log', message: 'Skipping overlapping partial transcribe' });
                self.postMessage({ status: 'partial-complete' }); // Core Fix: Release main thread lock on skipped steps
                return;
            }

            (self as any)._partialInProgress = true;

            const transcriber = await WhisperPipeline.getInstance();
            if (!transcriber || !audio) {
                (self as any)._partialInProgress = false;
                self.postMessage({ status: 'partial-complete' });
                return;
            }

            await transcriber(audio, {
                chunk_length_s: _partialChunkLengthS,
                stride_length_s: _partialStrideLengthS,
                callback_function: (beams: any[]) => {
                    const bestBeam = beams && beams[0];
                    if (!bestBeam) return;
                    const normalized = (bestBeam.text || '').replace(/\s+/g, ' ').trim();

                    if (normalized) {
                        if ((self as any)._lastPartialReported !== normalized) {
                            (self as any)._lastPartialReported = normalized;
                            const partialLatencyMs = clientSendTs ? Date.now() - clientSendTs : null;
                            self.postMessage({ status: 'update', output: normalized, inferenceId: null, clientSendTs, partialLatencyMs });
                        }
                    }
                }
            });

            (self as any)._partialInProgress = false;
            self.postMessage({ status: 'partial-complete' }); // Core Fix: Inform main thread worker thread is free
        } catch (error) {
            (self as any)._partialInProgress = false;
            self.postMessage({ status: 'partial-complete' }); // Safe fallback release
        }
    }
};