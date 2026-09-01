// STT adapters. The real adapter mirrors src/workers/whisper.worker.ts so eval
// numbers reflect production.
//
// Requires (dev): `npm i -D wavefile`  (audio decode in Node)
// Uses the app's existing dep: @huggingface/transformers (v3).
import { readFileSync } from 'node:fs';
import type { SttAdapter } from './types';

/**
 * Deterministic mock for testing the harness itself (no audio/model needed).
 */
export class MockSttAdapter implements SttAdapter {
  readonly name = 'mock';
  constructor(private readonly table: Record<string, string> = {}) {}
  async transcribe(audioPath: string): Promise<string> {
    return this.table[audioPath] ?? '';
  }
}

/**
 * Decode a WAV file to 16kHz mono Float32 — the input Whisper expects.
 * WAV keeps this dependency-light; convert mp3/m4a to wav first (e.g. ffmpeg:
 *   ffmpeg -i in.mp3 -ac 1 -ar 16000 out.wav).
 */
async function decodeWavTo16kMonoFloat32(path: string): Promise<Float32Array> {
  // wavefile is CommonJS; handle named/default interop across tsx, vitest, and node.
  const mod = (await import('wavefile')) as unknown as { WaveFile?: unknown; default?: { WaveFile?: unknown } };
  const WaveFileCtor = (mod.WaveFile ?? mod.default?.WaveFile ?? mod.default) as new (data?: Uint8Array) => {
    toBitDepth(d: string): void; toSampleRate(r: number): void; getSamples(): Float64Array | Float64Array[];
  };
  const wav = new WaveFileCtor(readFileSync(path));
  wav.toBitDepth('32f');       // float samples in [-1, 1]
  wav.toSampleRate(16000);     // Whisper's required rate
  let samples = wav.getSamples() as Float64Array | Float64Array[];
  if (Array.isArray(samples)) samples = samples[0]; // stereo -> first channel (mono)
  return Float32Array.from(samples as ArrayLike<number>);
}

/**
 * Runs the SAME model/config as the production worker:
 *   - @huggingface/transformers v3, task automatic-speech-recognition
 *   - default model Xenova/whisper-tiny (the app's wasm-simd tier)
 *     (pass 'Xenova/whisper-base' to mirror the WebGPU tier)
 *   - device 'wasm', dtype 'fp32', 16kHz, { language: 'en', task: 'transcribe' }
 */
export class XenovaWhisperAdapter implements SttAdapter {
  readonly name: string;
  private transcriber: ((audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text?: string }>) | null = null;

  constructor(
    private readonly modelId = 'Xenova/whisper-small',
    /** ONNX execution provider for Node: 'cpu' (portable) or 'dml' (Windows GPU). */
    private readonly device: 'cpu' | 'dml' = 'cpu'
  ) {
    this.name = `whisper:${modelId}`;
  }

  private async getTranscriber() {
    if (this.transcriber) return this.transcriber;
    const { pipeline, env } = await import('@huggingface/transformers');
    // Allow pulling the model from the HF hub when running the eval in Node.
    env.allowRemoteModels = true;
    // NOTE: 'wasm' is the browser-only ONNX backend used by whisper.worker.ts.
    // In Node, @huggingface/transformers runs on onnxruntime-node, whose valid
    // execution providers are 'cpu' (all platforms) or 'dml' (Windows DirectML,
    // GPU-accelerated). 'cpu' is used here for portability; pass 'dml' below if
    // you're on Windows and want GPU acceleration.
    const asr = await pipeline('automatic-speech-recognition', this.modelId, {
      device: this.device,
      dtype: 'fp32',
    });
    this.transcriber = asr as unknown as typeof this.transcriber;
    return this.transcriber!;
  }

  async transcribe(audioPath: string): Promise<string> {
    const audio = await decodeWavTo16kMonoFloat32(audioPath);
    const asr = await this.getTranscriber();
    // Mirror production decode params (TEC-01 #2) so eval numbers reflect the app.
    // Set IMMIGO_STT_TUNING=off to A/B against the untuned baseline.
    const tuned = process.env.IMMIGO_STT_TUNING !== 'off';
    const opts = tuned
      ? {
          language: 'en',
          task: 'transcribe',
          temperature: [0, 0.2, 0.4] as number[],
          compression_ratio_threshold: 2.4,
          logprob_threshold: -1.0,
          no_speech_threshold: 0.6,
          condition_on_previous_text: false,
        }
      : { language: 'en', task: 'transcribe' };
    const out = await asr(audio, opts);
    return (out.text ?? '').trim();
  }
}