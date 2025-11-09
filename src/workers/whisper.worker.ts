// src/workers/whisper.worker.ts
import { pipeline, env, AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

// Skip local model check to directly download from the Hugging Face Hub
env.allowLocalModels = false;

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
            // Use 'any' as an intermediate type to break the complex type inference chain
            const p: any = await pipeline(this.task, this.model, { progress_callback });
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
            
            // The transcriber function handles state and streams internally.
            // We feed it the latest audio chunk.
            const result = await transcriber(audio, {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: 'english',
                task: 'transcribe',
            });

            if (result) {
                // Post the latest transcription result back to the main thread.
                self.postMessage({ status: 'interim-result', output: result.text });
            }
        }
    } catch (error: any) {
        self.postMessage({ status: 'error', message: error.message });
    }
});
