// src/workers/whisper.worker.ts
import { pipeline, env, AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

// Skip local model check to directly download from the Hugging Face Hub by default.
// We'll probe a few candidate URLs for local runtime/model assets and report them
// back to the main thread so the UI can show helpful diagnostics or the loader
// can adapt if needed.
env.allowLocalModels = false;

// Helper: try candidate URLs and return the first that responds with ok.
async function tryFindAsset(candidates: string[], timeoutMs = 5000): Promise<string | null> {
    for (const url of candidates) {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
            clearTimeout(id);
            if (res.ok) {
                return url;
            }
        } catch (e) {
            // ignore and try next
        }
    }
    return null;
}

function serializeError(err: any) {
    try {
        return {
            name: err?.name,
            message: err?.message,
            stack: err?.stack,
            // include any extra enumerable props
            ...Object.keys(err || {}).reduce((acc: any, k) => {
                try { acc[k] = err[k]; } catch(e) {}
                return acc;
            }, {})
        };
    } catch (e) {
        return { message: String(err) };
    }
}

/**
 * A singleton class to manage the speech recognition pipeline instance.
 */
class PipelineSingleton {
    static task: 'automatic-speech-recognition' = 'automatic-speech-recognition';
    static model = 'Xenova/whisper-tiny.en';
    private static instance: AutomaticSpeechRecognitionPipeline | null = null;

    /**
     * Returns a singleton instance of the pipeline.
     * This method is async and will create the instance on the first call.
     * @param {Function} progress_callback - A callback function to report progress.
     * @returns {Promise<AutomaticSpeechRecognitionPipeline>} A promise that resolves with the pipeline instance.
     */
    static async getInstance(progress_callback?: (progress: any) => void): Promise<AutomaticSpeechRecognitionPipeline> {
        if (this.instance === null) {
            // Before creating the pipeline, probe for a few likely local asset locations
            // so we can report back which paths (if any) are available. This helps
            // diagnose 404s for ort-wasm / .mjs / model files in hosted environments.
            const ortMjsCandidates = [
                '/assets/ort-wasm-simd-threaded.mjs',
                '/assets/ort-wasm-simd.mjs',
                '/assets/ort-wasm.mjs',
                '/ort-wasm-simd-threaded.mjs',
            ];
            const ortWasmCandidates = [
                '/assets/ort-wasm-simd-threaded.wasm',
                '/assets/ort-wasm-simd.wasm',
                '/assets/ort-wasm.wasm',
                '/ort-wasm-simd-threaded.wasm',
            ];
            const modelCandidates = [
                '/assets/silero_vad_legacy.onnx',
                '/silero_vad_legacy.onnx',
                '/assets/silero_vad.onnx',
            ];

            // Probe in parallel with small timeouts
            const [foundMjs, foundWasm, foundModel] = await Promise.all([
                tryFindAsset(ortMjsCandidates, 3000),
                tryFindAsset(ortWasmCandidates, 3000),
                tryFindAsset(modelCandidates, 3000),
            ]);

            // Inform the main thread about what we found (or didn't)
            self.postMessage({ status: 'asset-check', assets: { ortMjs: foundMjs, ortWasm: foundWasm, sileroOnnx: foundModel } });

            // Use 'any' as an intermediate type to break the complex type inference chain
            let p: any;
            try {
                p = await pipeline(this.task, this.model, { progress_callback });
            } catch (err) {
                // serialize and send detailed error to main thread before rethrowing
                self.postMessage({ status: 'error', error: serializeError(err) });
                throw err;
            }
            this.instance = p as AutomaticSpeechRecognitionPipeline;
        }
        return this.instance;
    }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
    const { action, audio } = event.data;

    try {
        if (action === 'load') {
            // Load the model and send a ready message
            await PipelineSingleton.getInstance((progress: any) => {
                self.postMessage(progress);
            });
            self.postMessage({ status: 'ready' });

        } else if (action === 'transcribe') {
            const transcriber = await PipelineSingleton.getInstance();

            try {
                const result = await transcriber(audio, {
                    chunk_length_s: 30,
                    stride_length_s: 5,
                    language: 'english',
                    task: 'transcribe',
                });

                if (result) {
                    // Add this log (use postMessage for structured logging to main thread)
                    self.postMessage({ status: 'log', level: 'debug', message: 'Worker: Transcriber result', result });
                    let output_text = '';
                    if (Array.isArray(result)) {
                        // Join the text from all chunks if it's an array
                        output_text = result.map(r => r.text).join('');
                    } else {
                        // Otherwise, just use the text from the single result
                        output_text = result.text;
                    }
                    // Post the latest transcription result back to the main thread.
                    self.postMessage({ status: 'interim-result', output: output_text });
                }
            } catch (err) {
                // Send back serialized error info
                self.postMessage({ status: 'error', error: serializeError(err) });
            }
        }
    } catch (error: any) {
        // Top-level catch: serialize and send full error object
        self.postMessage({ status: 'error', error: serializeError(error) });
    }
});
