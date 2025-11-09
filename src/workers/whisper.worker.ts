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
            // Transcribe the audio
            const transcriber = await PipelineSingleton.getInstance();
            const result = await transcriber(audio, {
                // Provide a callback function to receive intermediate results
                callback_function: (beams: any[]) => {
                    const bestBeam = beams.reduce((prev, curr) => (prev.score > curr.score ? prev : curr));
                    self.postMessage({ status: 'interim-result', output: bestBeam.text });
                },
                chunk_length_s: 30,
                stride_length_s: 5,
                language: 'english',
                task: 'transcribe',
            });
            self.postMessage({ status: 'complete', output: result });
        }
    } catch (error: any) {
        self.postMessage({ status: 'error', message: error.message });
    }
});
