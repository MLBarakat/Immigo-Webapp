type WorkerAction = 'INIT' | 'TRANSCRIBE' | 'RESET';
type WorkerStatus = 'INIT_COMPLETED' | 'PROGRESS' | 'COMPLETED' | 'ERROR';
type RuntimeTier = 'webgpu' | 'wasm-simd' | 'quantized-tiny';

interface WorkerRequestMessage {
  action: WorkerAction;
  correlationId: string;
  payload?: {
    audio?: Float32Array;
    config?: {
      language?: string;
      task?: 'transcribe';
      useWebGPU?: boolean;
      tier?: RuntimeTier;
    };
  };
}

interface WorkerResponseMessage {
  status: WorkerStatus;
  correlationId: string;
  payload: {
    text?: string;
    latencyMs?: number;
    language?: string;
    error?: string;
    realTimeFactor?: number;
    progress?: number;
    tier?: RuntimeTier;
  };
}

interface PipelineOptions {
  progress_callback?: (progress: ProgressMessage) => void;
  device?: 'webgpu' | 'wasm';
  dtype?: 'fp32' | 'q8';
}

interface ProgressMessage {
  status?: string;
  progress?: number;
  loaded?: number;
  total?: number;
  file?: string;
}

interface TranscriberResult {
  text?: string;
  chunks?: unknown[];
  dispose?: () => void;
}

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<TranscriberResult>;

const SAMPLE_RATE = 16_000;
const MODEL_BY_TIER: Record<RuntimeTier, string> = {
  webgpu: 'Xenova/whisper-base',
  'wasm-simd': 'Xenova/whisper-tiny',
  'quantized-tiny': 'Xenova/whisper-tiny',
};

let activeTier: RuntimeTier = 'webgpu';
let transcriber: Transcriber | null = null;
let loadingPromise: Promise<Transcriber> | null = null;
let lastCorrelationId = 'worker-boot';

function postMessageToMain(message: WorkerResponseMessage): void {
  self.postMessage(message);
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function disposeDeep(value: unknown, seen = new Set<unknown>()): void {
  if (!value || seen.has(value)) return;
  seen.add(value);

  if (typeof value === 'object' && 'dispose' in value) {
    const candidate = value as { dispose?: unknown };
    if (typeof candidate.dispose === 'function') {
      candidate.dispose();
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) disposeDeep(item, seen);
    return;
  }

  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      disposeDeep(item, seen);
    }
  }
}

function calculateProgress(progress: ProgressMessage): number {
  if (typeof progress.progress === 'number') return progress.progress;
  if (typeof progress.loaded === 'number' && typeof progress.total === 'number' && progress.total > 0) {
    return Math.round((progress.loaded / progress.total) * 100);
  }
  return 0;
}

async function createTranscriber(correlationId: string, tier: RuntimeTier): Promise<Transcriber> {
  const module = await import('@huggingface/transformers');
  const transformers = module as unknown as {
    pipeline: (task: string, model: string, options?: PipelineOptions) => Promise<Transcriber>;
    env?: {
      allowLocalModels?: boolean;
      allowRemoteModels?: boolean;
      localModelPath?: string;
      backends?: Record<string, unknown>;
    };
  };

  if (transformers.env) {
    transformers.env.allowLocalModels = true;
    transformers.env.allowRemoteModels = true;
    transformers.env.localModelPath = '/models/';
  }

  const useWebGpu = tier === 'webgpu';
  const options: PipelineOptions = {
    device: useWebGpu ? 'webgpu' : 'wasm',
    dtype: tier === 'quantized-tiny' ? 'q8' : 'fp32',
    progress_callback: (progress) => {
      postMessageToMain({
        status: 'PROGRESS',
        correlationId,
        payload: { progress: calculateProgress(progress), tier },
      });
    },
  };

  return transformers.pipeline('automatic-speech-recognition', MODEL_BY_TIER[tier], options);
}

async function getTranscriber(correlationId: string, tier: RuntimeTier): Promise<Transcriber> {
  if (transcriber && activeTier === tier) return transcriber;
  if (loadingPromise && activeTier === tier) return loadingPromise;

  activeTier = tier;
  loadingPromise = createTranscriber(correlationId, tier)
    .then((pipeline) => {
      transcriber = pipeline;
      return pipeline;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

async function warmUp(correlationId: string, tier: RuntimeTier): Promise<void> {
  const pipeline = await getTranscriber(correlationId, tier);
  const warmupAudio = new Float32Array(Math.floor(SAMPLE_RATE * 0.5));
  const result = await pipeline(warmupAudio, {
    chunk_length_s: 0.5,
    stride_length_s: 0,
    language: 'en',
    task: 'transcribe',
  });
  disposeDeep(result);
}

function fallbackTranscript(audio: Float32Array): string {
  return audio.length >= 3_200 ? '' : '';
}

async function handleInit(message: WorkerRequestMessage): Promise<void> {
  const tier = message.payload?.config?.tier ?? (message.payload?.config?.useWebGPU === false ? 'wasm-simd' : 'webgpu');
  try {
    await warmUp(message.correlationId, tier);
    postMessageToMain({ status: 'INIT_COMPLETED', correlationId: message.correlationId, payload: { tier } });
  } catch (error) {
    const fallbackTier: RuntimeTier = tier === 'webgpu' ? 'wasm-simd' : 'quantized-tiny';
    try {
      await warmUp(message.correlationId, fallbackTier);
      postMessageToMain({ status: 'INIT_COMPLETED', correlationId: message.correlationId, payload: { tier: fallbackTier } });
    } catch (fallbackError) {
      postMessageToMain({
        status: 'ERROR',
        correlationId: message.correlationId,
        payload: { error: `Worker init failed: ${normalizeError(fallbackError || error)}`, tier: fallbackTier },
      });
    }
  }
}

async function handleTranscribe(message: WorkerRequestMessage): Promise<void> {
  const audio = message.payload?.audio;
  const startedAt = performance.now();
  const tier = message.payload?.config?.tier ?? activeTier;

  if (!audio || audio.length < 3_200) {
    postMessageToMain({
      status: 'COMPLETED',
      correlationId: message.correlationId,
      payload: { text: '', latencyMs: 0, realTimeFactor: 0, tier },
    });
    return;
  }

  try {
    const pipeline = await getTranscriber(message.correlationId, tier);
    const result = await pipeline(audio, {
      chunk_length_s: Math.min(20, Math.max(1, audio.length / SAMPLE_RATE)),
      stride_length_s: 1,
      language: message.payload?.config?.language,
      task: message.payload?.config?.task ?? 'transcribe',
    });

    const latencyMs = performance.now() - startedAt;
    const durationSeconds = audio.length / SAMPLE_RATE;
    const text = typeof result.text === 'string' ? result.text.replace(/\s+/g, ' ').trim() : fallbackTranscript(audio);
    disposeDeep(result);

    postMessageToMain({
      status: 'COMPLETED',
      correlationId: message.correlationId,
      payload: {
        text,
        latencyMs,
        language: message.payload?.config?.language,
        realTimeFactor: durationSeconds > 0 ? latencyMs / 1000 / durationSeconds : 0,
        tier,
      },
    });
  } catch (error) {
    postMessageToMain({
      status: 'ERROR',
      correlationId: message.correlationId,
      payload: { error: `Transcription failed: ${normalizeError(error)}`, tier },
    });
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequestMessage>) => {
  const message = event.data;
  lastCorrelationId = message.correlationId || lastCorrelationId;

  if (message.action === 'INIT') {
    void handleInit(message);
    return;
  }

  if (message.action === 'TRANSCRIBE') {
    void handleTranscribe(message);
    return;
  }

  if (message.action === 'RESET') {
    transcriber = null;
    loadingPromise = null;
    postMessageToMain({ status: 'INIT_COMPLETED', correlationId: message.correlationId, payload: { tier: activeTier } });
  }
});

self.addEventListener('error', (event) => {
  postMessageToMain({
    status: 'ERROR',
    correlationId: lastCorrelationId,
    payload: { error: event.message, tier: activeTier },
  });
});

self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  postMessageToMain({
    status: 'ERROR',
    correlationId: lastCorrelationId,
    payload: { error: normalizeError(event.reason), tier: activeTier },
  });
});
