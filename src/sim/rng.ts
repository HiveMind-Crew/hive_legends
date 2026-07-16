/**
 * Seeded deterministic RNG (mulberry32). The generator state lives in
 * SimState.rngState so the whole simulation can be serialized, replayed,
 * and kept in lockstep across peers.
 */

export function rngSeed(seed: number): number {
  return seed >>> 0;
}

/** Advances the state and returns [value in [0,1), nextState]. */
export function rngNext(state: number): [number, number] {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, nextState];
}

/** Integer in [min, max] inclusive. */
export function rngIntRange(state: number, min: number, max: number): [number, number] {
  const [v, next] = rngNext(state);
  return [min + Math.floor(v * (max - min + 1)), next];
}
