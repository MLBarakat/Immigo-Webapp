import { describe, it, expect } from 'vitest';
import { isMobileUserAgent, constrainOrtWasmThreadsForMobile } from '../ortWasmConfig';

const IPHONE_CRIOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/155.0.8059.37 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const DESKTOP_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

describe('isMobileUserAgent', () => {
  it('detects iPhone Chrome (the field device that motivated the guard)', () => {
    expect(isMobileUserAgent(IPHONE_CRIOS)).toBe(true);
  });

  it('detects Android Chrome', () => {
    expect(isMobileUserAgent(ANDROID_CHROME)).toBe(true);
  });

  it('detects iPadOS 13+ desktop-masquerading UA via multi-touch', () => {
    expect(isMobileUserAgent(IPAD_DESKTOP_UA, 5)).toBe(true);
  });

  it('does not flag a real desktop (no touch) with the same Macintosh UA', () => {
    expect(isMobileUserAgent(IPAD_DESKTOP_UA, 0)).toBe(false);
  });

  it('does not flag desktop Chrome', () => {
    expect(isMobileUserAgent(DESKTOP_CHROME, 0)).toBe(false);
  });
});

describe('constrainOrtWasmThreadsForMobile', () => {
  it('forces numThreads to 1 on mobile regardless of the runtime default', () => {
    const wasmEnv = { numThreads: 8 };
    const effective = constrainOrtWasmThreadsForMobile(wasmEnv, IPHONE_CRIOS);
    expect(wasmEnv.numThreads).toBe(1);
    expect(effective).toBe(1);
  });

  it('leaves the runtime default untouched on desktop', () => {
    const wasmEnv = { numThreads: 8 };
    const effective = constrainOrtWasmThreadsForMobile(wasmEnv, DESKTOP_CHROME, 0);
    expect(wasmEnv.numThreads).toBe(8);
    expect(effective).toBe(8);
  });

  it('leaves an unset default untouched on desktop and reports 1 as effective', () => {
    const wasmEnv: { numThreads?: number } = {};
    const effective = constrainOrtWasmThreadsForMobile(wasmEnv, DESKTOP_CHROME, 0);
    expect(wasmEnv.numThreads).toBeUndefined();
    expect(effective).toBe(1);
  });
});
