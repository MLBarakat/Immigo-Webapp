// src/workers/whisper.worker.ts

import { pipeline, env, Pipeline } from '@xenova/transformers';

// --- Configuration ---
// 1. Environment settings for Transformers.js
env.allowLocalModels = true;
env.allowRemoteModels = true;
// NOTE: You may need to adjust the model path based on your project structure if you host them locally.
// By default, it will fetch from the Hugging Face Hub.
env.localModelPath = '/models/';

// 2. Model and Pipeline definition
class WhisperPipeline {
    static task = 'automatic-speech-recognition';
    // Using a multilingual model for broader compatibility
    static model = 'Xenova/whisper-tiny'; 
    static instance: Pipeline | null = null;

    static async getInstance(progress_callback?: (progress: any) => void) {
        // Use a no-op callback when none is provided to satisfy the pipeline API
        const cb = progress_callback ?? (() => {});

        if (this.instance === null) {
            try {
                this.instance = await pipeline(this.task, this.model, { 
                    progress_callback: cb,
                    // Specify quantization for faster inference and lower memory usage
                    quantized: true, 
                });
            } catch (error) {
                self.postMessage({ status: 'error', error: `Failed to load model: ${error}` });
                return null;
            }
        }
        return this.instance;
    }
}

// --- Message Handler ---
self.onmessage = async (event) => {
    const { action, audio } = event.data;

    if (action === 'load') {
        // Load the model and report progress to the main thread
        await WhisperPipeline.getInstance(progress => {
            self.postMessage(progress);
        });
        self.postMessage({ status: 'ready' });
        return;
    }

    if (action === 'transcribe') {
        const transcriber = await WhisperPipeline.getInstance(); // Already loaded, no progress callback needed
        if (!transcriber || !audio) {
            self.postMessage({ status: 'error', error: 'Transcription service is not ready or audio is missing.' });
            return;
        }

        try {
            // The VAD provides audio as a Float32Array, which is what the model expects.
            // The `callback_function` is the key to getting streaming, interim results.
            const output = await transcriber(audio, {
                chunk_length_s: 30,
                stride_length_s: 5,
                callback_function: (beams: any[]) => {
                    // This function is called with interim results during transcription.
                    const bestBeam = beams[0];
                    if (bestBeam) {
                        self.postMessage({
                            status: 'update',
                            output: bestBeam.text,
                        });
                    }
                }
            });

            // Once the entire chunk is processed, the promise resolves with the final text.
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