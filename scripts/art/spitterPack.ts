import { encodePng, rasterize, type Palette } from './pixels';

/**
 * Bile Spitter family — original 28×24 enemy art for issues #27 and #78.
 *
 * The image-generation concept in docs/design/concepts established the large
 * rear reservoir, narrow thorax and trumpet mouth. These runtime sprites redraw
 * that silhouette on a reviewable 14×12 logical grid, expanded 2×. The windup
 * plants all six legs, swells the sac with bile-light and braces the open funnel
 * before the three-glob fan releases.
 */

type Frame = 'w0' | 'w1' | 'windup';
type Tier = 'common' | 'veteran' | 'elite';

const PALETTES: Record<Tier, Palette> = {
  common: { G: '#3e6627', O: '#17131f', D: '#5b8f33', B: '#9fe06a', L: '#c8f09a', E: '#1c260f', W: '#dfff5a' },
  veteran: { G: '#765822', O: '#17131f', D: '#a8813a', B: '#f0c25e', L: '#f7db9a', E: '#2a1f0a', W: '#fff07a' },
  elite: { G: '#ff8a7a', O: '#3b0f12', D: '#8f2f30', B: '#e0524d', L: '#f08a86', E: '#260b0b', W: '#ffe36e' }
};

const FRAMES: Record<Frame, readonly string[]> = {
  w0: [
    '..............',
    '..OOOO........',
    '.ODDDDO.......',
    'ODBBBBODO...O.',
    'ODBLLBDOD..ODO',
    'ODBBBBODDBBDDO',
    '.ODDDDOOD..ODO',
    '..OOOO.O....O.',
    '.O..O...O.O...',
    'O....O...O....',
    '..............',
    '..............'
  ],
  w1: [
    '..............',
    '..OOOO........',
    '.ODDDDO.......',
    'ODBBBBODO...O.',
    'ODBLLBDOD..ODO',
    'ODBBBBODDBBDDO',
    '.ODDDDOOD..ODO',
    '..OOOOO.....O.',
    '...O..O...O...',
    '..O....O...O..',
    '..............',
    '..............'
  ],
  windup: [
    '.OWWWW........',
    'OWLLLLWO......',
    'WLLBBLLWO.....',
    'WLBWWBLWO...O.',
    'WLLBBLLWOD.ODO',
    'OWLLLLWODWWLWO',
    '.OWWWWOOOD.ODO',
    '..OOOO.O....O.',
    '.O...O...O....',
    'O.....O...O...',
    '..............',
    '..............'
  ]
};

function expand2x(rows: readonly string[]): string[] {
  return rows.flatMap((row) => {
    const doubled = [...row].map((pixel) => pixel.repeat(2)).join('');
    return [doubled, doubled];
  });
}

export function buildSpitterPack(): Map<string, Uint8Array> {
  const pack = new Map<string, Uint8Array>();
  for (const tier of Object.keys(PALETTES) as Tier[]) {
    for (const frame of Object.keys(FRAMES) as Frame[]) {
      const key = `enemy-spitter-${tier}-${frame}`;
      const bitmap = rasterize(expand2x(FRAMES[frame]), PALETTES[tier], key);
      if (bitmap.w !== 28 || bitmap.h !== 24) {
        throw new Error(`${key}: frame is ${bitmap.w}x${bitmap.h}, expected 28x24`);
      }
      pack.set(key, encodePng(bitmap));
    }
  }
  return pack;
}
