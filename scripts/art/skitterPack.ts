import { encodePng, rasterize, type Palette } from './pixels';

/**
 * Skitter family — original 24 px enemy art for issue #27.
 *
 * Every tier shares these exact silhouettes and changes palette only. Drawn
 * facing +x: the renderer rotates the sprite toward movement/attack targets.
 * The round abdomen reads as a swarmer; six splayed legs sell speed; the
 * windup compresses backward, opens the jaws, and flares the eyes.
 */

type Frame = 'w0' | 'w1' | 'windup';
type Tier = 'common' | 'veteran' | 'elite';

const PALETTES: Record<Tier, Palette> = {
  common: {
    G: '#3e6627',
    O: '#17131f',
    D: '#5b8f33',
    B: '#9fe06a',
    L: '#c8f09a',
    E: '#1c260f',
    W: '#ff5a4d'
  },
  veteran: {
    G: '#765822',
    O: '#17131f',
    D: '#a8813a',
    B: '#f0c25e',
    L: '#f7db9a',
    E: '#2a1f0a',
    W: '#ff5a4d'
  },
  elite: {
    G: '#ff8a7a',
    O: '#3b0f12',
    D: '#8f2f30',
    B: '#e0524d',
    L: '#f08a86',
    E: '#260b0b',
    W: '#ffe36e'
  }
};

const FRAMES: Record<Frame, readonly string[]> = {
  w0: [
    '........................',
    '........................',
    '........................',
    '........................',
    '.....O........O.........',
    '......O......O..........',
    '.......O....O...........',
    '..O....GOOOOG....O......',
    '...O.GGODDDDOGG.O.......',
    '....GODBBBBBBDOG........',
    '...GODBBLLLLBBDOG.......',
    '..GODBBLBBBBLBBDOG......',
    '..GODBBBBBBBBBBDOG.O....',
    '...GODBBBBBBBBDOG.O.....',
    '....GODDDDDDDDOG...O....',
    '...O.GGOOOOOOGG.O.......',
    '..O.....O..O.....O......',
    '.O.....O....O.....O.....',
    '......O......O..........',
    '.....O........O.........',
    '........................',
    '........................',
    '........................',
    '........................'
  ],
  w1: [
    '........................',
    '........................',
    '........................',
    '........................',
    '.........O.........O....',
    '........O.........O.....',
    '.......O....O....O......',
    '...O...GOOOOG...O.......',
    '..O..GGODDDDOGG.........',
    '.O..GODBBBBBBDOG........',
    '...GODBBLLLLBBDOG.......',
    '..GODBBLBBBBLBBDOG......',
    '..GODBBBBBBBBBBDOG.O....',
    '...GODBBBBBBBBDOG...O...',
    '....GODDDDDDDDOG.....O..',
    '..O..GGOOOOOOGG.........',
    '...O....O..O....O.......',
    '....O..O....O....O......',
    '......O......O....O.....',
    '.....O........O.........',
    '........................',
    '........................',
    '........................',
    '........................'
  ],
  windup: [
    '........................',
    '........................',
    '........................',
    '........................',
    '..O................O....',
    '...O..............O.....',
    '....O..GGOOOOGG..O......',
    '.....GGODDDDDOGG........',
    '....GODLLLLLLLDOG.......',
    '...GODLLBBBBBLLDOG......',
    '..GODLLBBBBBBBLLDOG.....',
    '..GODLBBBBBBBBBLDOG.....',
    '..GODLBBBBBBBBBLDOG.O...',
    '...GODLLBBBBBLLDOG.O.O..',
    '....GODLLLLLLLDOG...O.O.',
    '.....GGOOOOOOOGG.....O..',
    '...O...O....O...O.......',
    '..O...O......O...O......',
    '.O...O........O...O.....',
    '....O..........O........',
    '........................',
    '........................',
    '........................',
    '........................'
  ]
};

/** Add the small forward face without widening the shared abdomen. */
function addFace(rows: readonly string[], frame: Frame): string[] {
  const out = [...rows];
  const edits: Array<[number, number, string]> =
    frame === 'windup'
      ? [
          [10, 18, 'OWO.O'],
          [11, 18, 'OW.OO'],
          [12, 18, 'OWO.O']
        ]
      : [
          [10, 18, 'OEOO.'],
          [11, 18, 'ODOOO'],
          [12, 18, 'OEOO.']
        ];
  for (const [y, x, pixels] of edits) {
    const row = out[y]!;
    out[y] = `${row.slice(0, x)}${pixels}${row.slice(x + pixels.length)}`;
  }
  return out;
}

export function buildSkitterPack(): Map<string, Uint8Array> {
  const pack = new Map<string, Uint8Array>();
  for (const tier of Object.keys(PALETTES) as Tier[]) {
    for (const frame of Object.keys(FRAMES) as Frame[]) {
      const key = `enemy-skitter-${tier}-${frame}`;
      const bitmap = rasterize(addFace(FRAMES[frame], frame), PALETTES[tier], key);
      if (bitmap.w !== 24 || bitmap.h !== 24) {
        throw new Error(`${key}: frame is ${bitmap.w}x${bitmap.h}, expected 24x24`);
      }
      pack.set(key, encodePng(bitmap));
    }
  }
  return pack;
}
