import { encodePng, rasterize, type Palette } from './pixels';

/**
 * Husk family — original 32 px enemy art for issue #27.
 *
 * Authored on a 16×16 logical grid and expanded 2× for a deliberately heavy,
 * blocky silhouette. All tiers share the same broad plated torso, small tucked
 * head, stumpy legs and oversized forelimbs; only the palette changes.
 * The windup plants the body and raises both arms before the Carapace overhead
 * or Gravebound line rupture releases.
 */

type Frame = 'w0' | 'w1' | 'windup';
type Tier = 'common' | 'veteran' | 'elite';

const PALETTES: Record<Tier, Palette> = {
  common: { G: '#3e6627', O: '#17131f', D: '#5b8f33', B: '#9fe06a', L: '#c8f09a', E: '#1c260f', W: '#ff5a4d' },
  veteran: { G: '#765822', O: '#17131f', D: '#a8813a', B: '#f0c25e', L: '#f7db9a', E: '#2a1f0a', W: '#ff5a4d' },
  elite: { G: '#ff8a7a', O: '#3b0f12', D: '#8f2f30', B: '#e0524d', L: '#f08a86', E: '#260b0b', W: '#ffe36e' }
};

const FRAMES: Record<Frame, readonly string[]> = {
  w0: [
    '................',
    '....GG..........',
    '...GDDG.........',
    '.O.GDDDG........',
    'O.OGDBBDGG......',
    '.GODBLLBBDGG....',
    '..GDLBBBBBDG.O..',
    '.GODBBBBBBBDOEOO',
    '.GODBBBBBBBDODOO',
    '..GDLBBBBBDG.O..',
    '.GODBLLBBDGG....',
    'O.OGDBBDGG......',
    '.O.GDDDG........',
    '...GDDG.........',
    '....GG..........',
    '................'
  ],
  w1: [
    '................',
    '......GG........',
    '.....GDDG.......',
    'O...GDDDG.......',
    '.O.GGDBBDGG.....',
    '..GODBLLBBDGG...',
    '...GDLBBBBBDGO..',
    '..GODBBBBBBBDOEO',
    '..GODBBBBBBBDODO',
    '...GDLBBBBBDGO..',
    '..GODBLLBBDGG...',
    '.O.GGDBBDGG.....',
    'O...GDDDG.......',
    '.....GDDG.......',
    '......GG........',
    '................'
  ],
  windup: [
    '................',
    '..........OOO...',
    '...GG....ODDDOO.',
    '..GDDG..ODLLLDO.',
    '.GDDDDGGODLLLDO.',
    'GODLLLLLDGG.OO..',
    'GODLLLLLLDGO....',
    'GODLLLLLLLDOOWOO',
    'GODLLLLLLLDOOWOO',
    'GODLLLLLLDGO....',
    'GODLLLLLDGG.OO..',
    '.GDDDDGGODLLLDO.',
    '..GDDG..ODLLLDO.',
    '...GG....ODDDOO.',
    '..........OOO...',
    '................'
  ]
};

function expand2x(rows: readonly string[]): string[] {
  return rows.flatMap((row) => {
    const doubled = [...row].map((pixel) => pixel.repeat(2)).join('');
    return [doubled, doubled];
  });
}

export function buildHuskPack(): Map<string, Uint8Array> {
  const pack = new Map<string, Uint8Array>();
  for (const tier of Object.keys(PALETTES) as Tier[]) {
    for (const frame of Object.keys(FRAMES) as Frame[]) {
      const key = `enemy-husk-${tier}-${frame}`;
      const bitmap = rasterize(expand2x(FRAMES[frame]), PALETTES[tier], key);
      if (bitmap.w !== 32 || bitmap.h !== 32) {
        throw new Error(`${key}: frame is ${bitmap.w}x${bitmap.h}, expected 32x32`);
      }
      pack.set(key, encodePng(bitmap));
    }
  }
  return pack;
}
