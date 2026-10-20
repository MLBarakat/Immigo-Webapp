import { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export async function installSyntheticSpeech(page: Page, wavFilePath?: string) {
  const wavPath = wavFilePath ?? path.join(process.cwd(), 'tests', 'e2e', 'assets', 'sample-speech.wav');
  let wavBase64: string;
  if (fs.existsSync(wavPath)) {
    const buf = fs.readFileSync(wavPath);
    wavBase64 = buf.toString('base64');
  } else {
    // Fallback: generate a tiny WAV header + silence placeholder; real speech recommended
    // This is just to keep the fixture shape; for true VAD tests provide sample-speech.wav
    wavBase64 = '';
  }

  await page.addInitScript((b64) => {
    if (!b64) return;
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    // @ts-ignore
    navigator.mediaDevices.getUserMedia = async function (constraints?: MediaStreamConstraints) {
      try {
        if (constraints && (constraints as any).audio) {
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'audio/wav' });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          // @ts-ignore
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const resp = await fetch(url);
          const arr = await resp.arrayBuffer();
          const buf = await ctx.decodeAudioData(arr);
          const dest = ctx.createMediaStreamDestination();
          const source = ctx.createBufferSource();
          source.buffer = buf;
          source.loop = false;
          source.connect(dest);
          source.start(0);
          return dest.stream;
        }
      } catch (e) {
        // fall through to original
      }
      return origGetUserMedia(constraints);
    };
  }, wavBase64);
}
