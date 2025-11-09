// src/workers/whisper.worker.ts
import { pipeline, env, Pipeline, AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

// Skip local model check to directly download from the Hugging Face Hub
env.allowLocalModels = false;

/**
 * Represents the state of the pipeline.
 */
class PipelineSingleton {
    static task = 'automatic-speech-recognition';
    static model = 'Xenova/whisper-tiny.en';
    static instance: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

    /**
     * Returns a singleton instance of the pipeline.
     * @param {Function} progress_callback - A callback function to report progress.
     * @returns {Promise<Pipeline>} A promise that resolves with the pipeline instance.
     */
    static async getInstance(progress_callback?: (progress: any) => void) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
    try {
        // Retrieve the pipeline instance, providing a callback for progress updates
        const transcriber = await PipelineSingleton.getInstance((progress: any) => {
            self.postMessage(progress);
        });

        // Transcribe the audio and send the result back to the main thread
        const result = await transcriber(event.data.audio, {
            chunk_length_s: 30,
            stride_length_s: 5,
            language: 'english',
            task: 'transcribe',
        });

        // Send the transcribed text back to the main thread
        self.postMessage({ status: 'complete', output: result });

    } catch (error: any) {
        // Send an error message back to the main thread
        self.postMessage({ status: 'error', message: error.message });
    }
});
