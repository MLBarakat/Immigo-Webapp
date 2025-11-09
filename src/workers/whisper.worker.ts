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
            this.instance = await pipeline(this.task, this.model, { progress_callback }) as AutomaticSpeechRecognitionPipeline;
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
        self.postMessage({ status: 'error', message: error.message });
    }
});
