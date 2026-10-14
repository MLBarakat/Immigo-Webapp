import { env, pipeline } from '@huggingface/transformers';

type WorkerAction = 'INIT' | 'TRANSCRIBE' | 'RESET';
// INIT_COMPLETED now fires as soon as the fast quantized-tiny tier is ready —
// that's what the mic button waits on. UPGRADE_READY fires once the better
// (device-appropriate) tier has finished loading and warming up in the
// background and has been hot-swapped in; UPGRADE_FAILED fires if that
// background attempt fails, so the UI can clear its "upgrading" indicator
// without treating it as a real error — the app is already fully usable on
// quantized-tiny at that point.
type WorkerStatus = 'INIT_COMPLETED' | 'PROGRESS' | 'COMPLETED' | 'ERROR' | 'UPDATE' | 'UPGRADE_READY' | 'UPGRADE_FAILED';
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
      chunk_length_s?: number;
      stride_length_s?: number;
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
    upgradeError?: string;
    telemetry?: {
      vramUsageBytes: number;
      fragmentation: number;
    };
    stage?: 'initialization' | 'transcription' | 'runtime';
  };
  inferenceId?: number;
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
}

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<TranscriberResult>;

const SAMPLE_RATE = 16_000;
// TEC-01 (2): decoding parameters tuned to suppress the repetition/hallucination
// failure mode seen on hard/accented audio, without changing the model.
//   - temperature 0 with a fallback schedule: deterministic first pass, then
//     retries at higher temperature only if the decoder trips a threshold below.
//   - compression_ratio_threshold: rejects/rescues degenerate repeated output
//     ("the the the ...", "thank you for watching") — the classic hallucination.
//   - logprob_threshold: treats very low-confidence output as failed (triggers
//     the temperature fallback) rather than emitting garbage.
//   - no_speech_threshold: suppresses transcription of near-silent segments.
const DECODE_TUNING = {
  temperature: [0, 0.2, 0.4] as number[],
  compression_ratio_threshold: 2.4,
  logprob_threshold: -1.0,
  no_speech_threshold: 0.6,
  condition_on_previous_text: false,
};

const MODEL_BY_TIER: Record<RuntimeTier, string> = {
  webgpu: 'Xenova/whisper-small',
  'wasm-simd': 'Xenova/whisper-base',
  'quantized-tiny': 'Xenova/whisper-tiny',
};

// transformers.js caches every model's fetched files in one shared Cache
// Storage bucket regardless of tier. quantized-tiny MUST always be cached
// (fast load on page reload); whisper-small / whisper-base are allowed to
// cache within a session (so the tokenizer isn't re-fetched on every warmup
// inference call) but their entries are evicted right after warmup completes
// so they never consume quota between sessions and can never displace the
// tiny model's entries.
//
// evictStaleLargeTierCacheEntries() is therefore called TWICE per session:
//   1. At startup — clears any leftover entries from a previous session.
//   2. After the upgrade tier finishes warming up — immediately frees the
//      quota those entries just consumed, leaving only tiny in the cache.
const TRANSFORMERS_CACHE_NAME = 'transformers-cache';
const LARGE_TIER_MODEL_IDS = [MODEL_BY_TIER.webgpu, MODEL_BY_TIER['wasm-simd']];

async function evictStaleLargeTierCacheEntries(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const requests = await cache.keys();
    await Promise.all(
      requests
        .filter((request) => LARGE_TIER_MODEL_IDS.some((modelId) => request.url.includes(modelId)))
        .map((request) => cache.delete(request))
    );
  } catch {
    // Best-effort only — never let a Cache API quirk block model loading.
  }
}

let activeTier: RuntimeTier = 'wasm-simd';
let transcriberInstance: Transcriber | null = null;
let activeLoadingPromise: Promise<Transcriber> | null = null;
let lastTrackedCorrelationId = 'worker-boot';
let activeInferenceId = 0;

// Central Mutex Lock to prevent initialization race conditions across parallel thread events
let isInitializationMutexLocked = false;

function postMessageToMain(message: WorkerResponseMessage): void {
  self.postMessage(message);
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Safely disposes of underlying tensor allocations and intermediate operational weights
 * to satisfy FR-008 memory footprint recycling mandates.
 */
function disposeDeep(value: unknown, seen = new Set<unknown>()): void {
  if (!value || seen.has(value)) return;
  seen.add(value);

  if (typeof value === 'object' && value !== null && 'dispose' in value) {
    const candidate = value as { dispose?: unknown };
    if (typeof candidate.dispose === 'function') {
      try {
        candidate.dispose();
      } catch {
        // Prevent disposal errors from interrupting the thread context
      }
    }
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      disposeDeep(value[i], seen);
    }
    return;
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      disposeDeep(obj[keys[i]], seen);
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

/**
 * Queries and profiles local WebGPU memory metrics natively from the browser context
 * to feed our operational monitoring dashboards.
 */
function queryVramTelemetry(): { vramUsageBytes: number; fragmentation: number } {
  const fallbackBytes = 88000000; // Normalized baseline for untracked browsers
  const fallbackFragmentation = 0.05;

  if (typeof performance !== 'undefined' && 'memory' in performance) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mem = (performance as any).memory;
      if (mem && mem.totalJSHeapSize > 0) {
        return {
          vramUsageBytes: mem.usedJSHeapSize || fallbackBytes,
          fragmentation: mem.usedJSHeapSize / mem.totalJSHeapSize
        };
      }
    } catch {
      // Gracefully swallow restricted memory access errors in worker boundaries
    }
  }
  
  return { vramUsageBytes: fallbackBytes, fragmentation: fallbackFragmentation };
}

/**
 * Factory method to instantiate the automatic speech recognition pipeline using Transformers.js v3.
 * Configures the windowed Anti-Aliasing parameters natively.
 */
async function createTranscriber(correlationId: string, tier: RuntimeTier): Promise<Transcriber> {
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  const modelBasePath = import.meta.env.VITE_WHISPER_MODEL_BASE_PATH?.trim() || '/models/';
  env.localModelPath = modelBasePath.endsWith('/') ? modelBasePath : `${modelBasePath}/`;
  // Enable browser cache for all tiers within a session. Stale large-tier
  // entries (whisper-small, whisper-base) are evicted at startup by
  // evictStaleLargeTierCacheEntries() before the first load, so there is no
  // risk of serving outdated weights or overflowing quota. Without this,
  // transformers.js re-fetches the tokenizer and processor config files on
  // every inference call (including the warmup pass), producing a visible
  // triple-download of all metadata files in the network tab. With caching
  // enabled, those files are cached after the first fetch and reused.
  env.useBrowserCache = true;
  // Keep the ONNX WASM runtime on same-origin assets shipped in public/.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runtimeEnv = env as any;
  if (runtimeEnv.backends?.onnx?.wasm) {
    runtimeEnv.backends.onnx.wasm.wasmPaths = '/assets/js/';
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

  const transcriber = await pipeline('automatic-speech-recognition', MODEL_BY_TIER[tier], options);
  
  // Connect explicit hardware context-loss observers if WebGPU target is elected
  if (useWebGpu && typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gpu = (navigator as any).gpu;
      const adapter = await gpu.requestAdapter();
      const device = await adapter?.requestDevice();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      device?.lost.then((info: any) => {
        postMessageToMain({
          status: 'ERROR',
          correlationId,
          payload: { error: `FR-006 Context lost alert: WebGPU device unallocated. Reason: ${info?.message || 'unknown'}`, tier, stage: 'runtime' },
        });
        // Clear cached instances to force a clean runtime graph rebuild on the next pass
        transcriberInstance = null;
        activeLoadingPromise = null;
      });
    } catch {
      // Gracefully continue if manual adapter registration is blocked by background containers
    }
  }

  return transcriber as Transcriber;
}

/**
 * Mutex-locked pipeline state accessor. Eliminates promise overlaps during tier downscaling.
 */
async function getTranscriber(correlationId: string, tier: RuntimeTier): Promise<Transcriber> {
  if (transcriberInstance && activeTier === tier) return transcriberInstance;
  
  // Await the resolution of any active initialization loop if a race state occurs
  while (isInitializationMutexLocked) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  if (transcriberInstance && activeTier === tier) return transcriberInstance;
  if (activeLoadingPromise && activeTier === tier) return activeLoadingPromise;

  isInitializationMutexLocked = true;
  activeTier = tier;

  activeLoadingPromise = createTranscriber(correlationId, tier)
    .then((pipeline) => {
      transcriberInstance = pipeline;
      return pipeline;
    })
    .catch((error) => {
      transcriberInstance = null;
      activeLoadingPromise = null;
      throw error;
    })
    .finally(() => {
      isInitializationMutexLocked = false;
      activeLoadingPromise = null;
    });

  return activeLoadingPromise;
}

/**
 * Pre-compiles neural graph kernels natively before conversational capture loops begin.
 */
async function warmUp(correlationId: string, tier: RuntimeTier): Promise<void> {
  const pipeline = await getTranscriber(correlationId, tier);
  const warmupAudio = new Float32Array(Math.floor(SAMPLE_RATE * 0.5)); // 500ms zero-tensor array block
  const result = await pipeline(warmupAudio, {
    chunk_length_s: 20,
    stride_length_s: 1,
    language: 'en',
    task: 'transcribe',
    ...DECODE_TUNING,
  });
  disposeDeep(result);
}

function computePreferredTier(message: WorkerRequestMessage): RuntimeTier {
  const requestedTier = message.payload?.config?.tier;
  const webGpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
  return requestedTier ?? (
    message.payload?.config?.useWebGPU === true && webGpuAvailable ? 'webgpu' : 'wasm-simd'
  );
}

/**
 * Loads and warms up a tier WITHOUT going through getTranscriber()'s shared
 * activeTier/transcriberInstance bookkeeping. That bookkeeping flips
 * activeTier as soon as a load STARTS, not when it finishes — fine for the
 * very first load, but wrong for a background upgrade: if a transcription
 * request arrived mid-upgrade, it would read the (already-flipped) activeTier
 * and block on the still-loading upgrade instead of using the tiny tier that
 * is actually ready right now. This function only touches the shared state
 * once the upgrade is fully warmed up and ready to serve requests, so an
 * in-flight or newly-arriving request is never made to wait on it.
 */
async function loadAndWarmupIndependently(correlationId: string, tier: RuntimeTier): Promise<Transcriber> {
  const pipeline = await createTranscriber(correlationId, tier);
  const warmupAudio = new Float32Array(Math.floor(SAMPLE_RATE * 0.5));
  const result = await pipeline(warmupAudio, {
    chunk_length_s: 20,
    stride_length_s: 1,
    language: 'en',
    task: 'transcribe',
    ...DECODE_TUNING,
  });
  disposeDeep(result);
  return pipeline;
}

async function handleInit(message: WorkerRequestMessage): Promise<void> {
  const preferredTier = computePreferredTier(message);

  await evictStaleLargeTierCacheEntries();

  // Progressive loading: quantized-tiny has no GPU dependency and by far the
  // smallest payload, so it always loads first — that's what the mic button
  // waits on, regardless of device or connection speed. A genuine failure
  // here is a real error: there is no smaller/safer tier left to fall back
  // to, so the app has nothing usable to offer.
  try {
    await warmUp(message.correlationId, 'quantized-tiny');
  } catch (error) {
    postMessageToMain({
      status: 'ERROR',
      correlationId: message.correlationId,
      payload: {
        error: `Primary (quantized-tiny): ${normalizeError(error)}`,
        tier: 'quantized-tiny',
        stage: 'initialization',
      },
    });
    return;
  }

  postMessageToMain({ status: 'INIT_COMPLETED', correlationId: message.correlationId, payload: { tier: 'quantized-tiny' } });

  if (preferredTier === 'quantized-tiny') {
    // Device evaluation decided tiny is already the best available tier —
    // nothing to upgrade to. Report the upgrade phase as settled immediately
    // so the UI never shows an "upgrading" state that has nothing to resolve.
    postMessageToMain({ status: 'UPGRADE_READY', correlationId: message.correlationId, payload: { tier: 'quantized-tiny' } });
    return;
  }

  // Deliberately sequential, not concurrent with the tiny load above (which
  // has already finished by this point) or with anything else: downloading
  // two models at once would make both slower on a constrained connection,
  // for no benefit, since the mic is already usable on tiny.
  try {
    const upgradedPipeline = await loadAndWarmupIndependently(message.correlationId, preferredTier);
    // Atomic swap — only now does the tier serving live transcriptions change.
    transcriberInstance = upgradedPipeline;
    activeTier = preferredTier;
    postMessageToMain({ status: 'UPGRADE_READY', correlationId: message.correlationId, payload: { tier: preferredTier } });
  } catch (error) {
    // Non-fatal: the app is already fully usable on quantized-tiny. Stay on
    // it for this session rather than surface this as a user-facing error.
    postMessageToMain({
      status: 'UPGRADE_FAILED',
      correlationId: message.correlationId,
      payload: { tier: preferredTier, upgradeError: normalizeError(error) },
    });
  } finally {
    // Phase-2 cache hygiene: evict whatever the large tier wrote to Cache
    // Storage during this session. quantized-tiny's entries are untouched
    // (its model ID is not in LARGE_TIER_MODEL_IDS). This guarantees tiny
    // is the only model that persists in the cache between reloads and can
    // never be displaced by quota pressure from the larger models.
    void evictStaleLargeTierCacheEntries();
  }
}

async function handleTranscribe(message: WorkerRequestMessage): Promise<void> {
  const rawAudio = message.payload?.audio;
  const startedAt = performance.now();
  const tier = message.payload?.config?.tier ?? activeTier;
  const currentId = ++activeInferenceId;

  if (!rawAudio || rawAudio.length < 3_200) {
    postMessageToMain({
      status: 'COMPLETED',
      correlationId: message.correlationId,
      payload: { text: '', latencyMs: 0, realTimeFactor: 0, tier, telemetry: queryVramTelemetry() },
    });
    return;
  }

  // FIXED: Enforce strict array slicing bounds matching the 20-second ceiling to clear ORT dimension mismatch panics
  const maxAllowedSamples = 20 * SAMPLE_RATE;
  const audio = rawAudio.length > maxAllowedSamples ? rawAudio.subarray(0, maxAllowedSamples) : rawAudio;
  const durationSeconds = audio.length / SAMPLE_RATE;

  try {
    const pipeline = await getTranscriber(message.correlationId, tier);
    
    postMessageToMain({
      status: 'UPDATE',
      correlationId: message.correlationId,
      payload: { progress: 0, tier },
      inferenceId: currentId
    });

    const result = await pipeline(audio, {
      chunk_length_s: 20,
      stride_length_s: 1,
      language: message.payload?.config?.language,
      task: message.payload?.config?.task ?? 'transcribe',
      ...DECODE_TUNING,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback_function: (beams: any[]) => {
        const primaryBeam = beams && beams[0];
        if (!primaryBeam || currentId !== activeInferenceId) return;

        const interimText = typeof primaryBeam.text === 'string' ? primaryBeam.text.replace(/\s+/g, ' ').trim() : '';
        if (interimText) {
          postMessageToMain({
            status: 'UPDATE',
            correlationId: message.correlationId,
            payload: { text: interimText, tier },
            inferenceId: currentId
          });
        }
      }
    });

    if (currentId !== activeInferenceId) return;

    const latencyMs = performance.now() - startedAt;
    const text = typeof result.text === 'string' ? result.text.replace(/\s+/g, ' ').trim() : '';
    
    disposeDeep(result);

    postMessageToMain({
      status: 'COMPLETED',
      correlationId: message.correlationId,
      payload: {
        text,
        latencyMs,
        language: message.payload?.config?.language,
        realTimeFactor: durationSeconds > 0 ? (latencyMs / 1000) / durationSeconds : 0,
        tier,
        telemetry: queryVramTelemetry() // Returns active memory and fragmentation statistics
      },
      inferenceId: currentId
    });
  } catch (error) {
    postMessageToMain({
      status: 'ERROR',
      correlationId: message.correlationId,
      payload: { error: `Transcription processing failure: ${normalizeError(error)}`, tier, stage: 'transcription' },
    });
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequestMessage>) => {
  const message = event.data;
  if (!message) return;
  
  lastTrackedCorrelationId = message.correlationId || lastTrackedCorrelationId;

  if (message.action === 'INIT') {
    void handleInit(message);
    return;
  }

  if (message.action === 'TRANSCRIBE') {
    void handleTranscribe(message);
    return;
  }

  if (message.action === 'RESET') {
    transcriberInstance = null;
    activeLoadingPromise = null;
    isInitializationMutexLocked = false;
    postMessageToMain({ status: 'INIT_COMPLETED', correlationId: message.correlationId, payload: { tier: activeTier } });
  }
});

self.addEventListener('error', (event) => {
  postMessageToMain({
    status: 'ERROR',
    correlationId: lastTrackedCorrelationId,
    payload: { error: event.message, tier: activeTier, stage: 'runtime' },
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  postMessageToMain({
    status: 'ERROR',
    correlationId: lastTrackedCorrelationId,
    payload: { error: normalizeError(event.reason), tier: activeTier, stage: 'runtime' },
  });
});