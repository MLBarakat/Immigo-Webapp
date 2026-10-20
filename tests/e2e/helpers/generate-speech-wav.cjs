const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, '..', 'assets', 'sample-speech.wav');

// Generate a ~2s sine wave at 440Hz to trigger speech-like activity in VAD.
// Simple, deterministic, tiny file.
const sampleRate = 16000;
const durationSeconds = 2.0;
const freq = 440;
const amplitude = 0.3; // -10.5 dB-ish, within range
const numSamples = Math.floor(sampleRate * durationSeconds);

const dataSize = numSamples * 2; // 16-bit PCM
const buffer = Buffer.alloc(44 + dataSize);

let offset = 0;
function writeStr(s) { buffer.write(s, offset); offset += s.length; }
function writeUInt32LE(v) { buffer.writeUInt32LE(v, offset); offset += 4; }
function writeUInt16LE(v) { buffer.writeUInt16LE(v, offset); offset += 2; }

writeStr('RIFF');
writeUInt32LE(36 + dataSize);
writeStr('WAVE');
writeStr('fmt ');
writeUInt32LE(16); // PCM
writeUInt16LE(1);  // PCM
writeUInt16LE(1);  // mono
writeUInt32LE(sampleRate);
writeUInt32LE(sampleRate * 2); // byte rate
writeUInt16LE(2); // block align
writeUInt16LE(16); // bits per sample
writeStr('data');
writeUInt32LE(dataSize);

for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  const sample = Math.sin(2 * Math.PI * freq * t);
  const val = Math.max(-1, Math.min(1, sample * amplitude));
  const int16 = Math.floor(val * 0x7fff);
  buffer.writeInt16LE(int16, offset);
  offset += 2;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buffer);
console.log('Wrote', outPath);
