// Mobile memory guard for the ONNX WASM runtime.
//
// Field data (iOS 26 / CriOS) proved the WebContent process is killed by the
// OS at the transcript-submit peak: whisper inference + VAD + Polly playback +
// a fresh mic capture all overlap there. Because index.html sets
// `COEP: require-corp`, the page is crossOriginIsolated and ORT defaults to
// one wasm thread per CPU core — each thread carrying its own stack and
// scratch allocations. On a phone tab that extra footprint is what tips the
// process over the memory ceiling; on desktop it is harmless. Pinning the
// runtime to a single thread on phone-class devices is the largest
// controllable memory lever. Inference gets modestly slower; output is
// identical.
//
// This module is intentionally pure (no onnxruntime-web import) so it is
// trivially unit-testable and safe to import from both the main thread and
// the whisper worker (separate realm, its own ORT module instance).

/** True for phone/tablet-class user agents, including iPadOS 13+ which
 *  masquerades as desktop Safari (Macintosh UA with multi-touch). */
export function isMobileUserAgent(userAgent: string, maxTouchPoints = 0): boolean {
  if (/Android|iPhone|iPod|iPad|Mobile/i.test(userAgent)) return true;
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return true;
  return false;
}

/**
 * Forces `numThreads = 1` on mobile and leaves the runtime's own default
 * (all cores) untouched elsewhere. Mutates `wasmEnv` in place — pass
 * `ort.env.wasm` (main thread) or `env.backends.onnx.wasm` (whisper worker).
 * Returns the effective thread count for diagnostics logging.
 */
export function constrainOrtWasmThreadsForMobile(
  wasmEnv: { numThreads?: number },
  userAgent: string,
  maxTouchPoints = 0,
): number {
  if (isMobileUserAgent(userAgent, maxTouchPoints)) {
    wasmEnv.numThreads = 1;
  }
  return typeof wasmEnv.numThreads === 'number' && wasmEnv.numThreads >= 1 ? wasmEnv.numThreads : 1;
}
