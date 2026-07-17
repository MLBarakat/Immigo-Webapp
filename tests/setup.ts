// tests/setup.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// Global test setup executed before each Vitest test file.

// Stub browser APIs that are not available in jsdom
// ─────────────────────────────────────────────────
// AudioContext — jsdom does not implement Web Audio API
if (typeof globalThis.AudioContext === 'undefined') {
    (globalThis as any).AudioContext = class MockAudioContext {
        state = 'running';
        sampleRate = 16000;
        resume() { return Promise.resolve(); }
        close() { return Promise.resolve(); }
        createBufferSource() {
            return { connect: () => {}, start: () => {}, onended: null, buffer: null };
        }
        createGain() {
            return { connect: () => {}, gain: { value: 1 } };
        }
        destination = {};
    };
}

// Performance.now — available in jsdom but guard for node test environments
if (typeof globalThis.performance === 'undefined') {
    (globalThis as any).performance = { now: () => Date.now() };
}

// BroadcastChannel — not in older jsdom versions
if (typeof globalThis.BroadcastChannel === 'undefined') {
    (globalThis as any).BroadcastChannel = class MockBroadcastChannel {
        name: string;
        onmessage: ((ev: MessageEvent) => any) | null = null;
        constructor(name: string) { this.name = name; }
        postMessage(_data: any) {}
        close() {}
        addEventListener(_type: string, _handler: any) {}
        removeEventListener(_type: string, _handler: any) {}
    };
}
