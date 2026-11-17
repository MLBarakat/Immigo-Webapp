// amplify/functions/transcript/turn/seeded-random.ts
// Deterministic randomness for question selection.
//
// Standard Interviews and Practice sessions must be reproducible: the same
// exam/session id always yields the same sequence, while different ids yield
// different sequences. Math.random() cannot provide that guarantee, so the
// selectors use a small, dependency-free seeded PRNG (mulberry32) keyed by the
// session or exam id.

/** FNV-1a 32-bit string hash. Stable across runtimes. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: fast, deterministic, good enough for question ordering. */
export function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle that never mutates the input array. */
export function shuffleWithSeed<T>(items: readonly T[], seed: string): T[] {
  const shuffled = items.slice();
  const random = createSeededRandom(seed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}
