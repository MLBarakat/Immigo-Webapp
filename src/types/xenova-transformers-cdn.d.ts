declare module 'https://cdn.jsdelivr.net/npm/@xenova/transformers@3.0.0-alpha.12' {
  export interface ProgressMessage {
    status?: string;
    progress?: number;
    loaded?: number;
    total?: number;
    file?: string;
  }

  export interface PipelineOptions {
    progress_callback?: (progress: ProgressMessage) => void;
    device?: 'webgpu' | 'cpu' | 'cuda' | 'wasm';
    dtype?: 'fp32' | 'fp16' | 'q8' | 'q4';
    quantized?: boolean;
  }

  export interface TranscriberResult {
    text: string;
    chunks?: Array<{
      text: string;
      timestamp: [number, number] | null;
    }>;
    dispose?: () => void;
  }

  export interface TranscriberConfigOptions {
    chunk_length_s?: number;
    stride_length_s?: number;
    language?: string;
    task?: 'transcribe' | 'translate';
    callback_function?: (beams: Array<{ text: string; token_ids: number[] }>) => void;
  }

  export type TranscriberPipeline = (
    audio: Float32Array,
    options?: TranscriberConfigOptions
  ) => Promise<TranscriberResult>;

  export interface EnvironmentConfigurations {
    allowLocalModels: boolean;
    allowRemoteModels: boolean;
    localModelPath: string;
    remoteModelPath: string;
    backends: {
      onnx: {
        wasm: Record<string, unknown>;
        webgpu: Record<string, unknown>;
      };
    };
  }

  export const env: EnvironmentConfigurations;

  export function pipeline(
    task: 'automatic-speech-recognition',
    model: string,
    options?: PipelineOptions
  ): Promise<TranscriberPipeline>;
}