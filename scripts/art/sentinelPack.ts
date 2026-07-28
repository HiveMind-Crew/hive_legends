import { encodePng, mirror, rasterize, type Palette } from './pixels';

/**
 * Odo Brakk, the Sentinel — original 36 px hero art for issue #27.
 *
 * The drawings are authored on an 18×18 logical pixel grid and expanded 2×.
 * That keeps the chunky arcade silhouette deliberate and makes every mark
 * reviewable here. Odo reads through three shapes: the broad resin tower
 * shield, low horned helm, and square-headed amber maul.
 *
 * The renderer supplies shadows and player accents, so this pack contains
 * neither. Five facings are drawn; the other three are safe mirrors because
 * Odo's equipment is deliberately ambidextrous.
 */

export const SENTINEL_PALETTE: Palette = {
  O: '#17131f', // outline
  K: '#292534', // deep chitin
  k: '#494354', // lit chitin
  B: '#b7aa91', // bone plate
  b: '#786f63', // bone shadow
  R: '#855235', // resin leather
  r: '#553322', // resin shadow
  A: '#ffd75e', // amber light
  a: '#c58a32', // amber shadow
  F: '#d8b184', // face
  S: '#655b70', // shield face
  M: '#d7c9ad' // maul head
};

type Pose = 'w0' | 'w1' | 'atk';
type DirectionFrames = Record<Pose, readonly string[]>;

const EAST: DirectionFrames = {
  w0: [
    '..................',
    '..................',
    '.......OO.........',
    '.....OOKKOO.......',
    '....OKBKKKOO......',
    '....OKKFFKkO......',
    '...OOSSSOKkkO.....',
    '..OSSSSSORRkO.....',
    '..OSASSSORRkOO....',
    '..OSSSSSOKKkOaO...',
    '..OSSSSSOKKkOAOO..',
    '...OSSSOORRkOMaO..',
    '....OOO.ORRkOMMO..',
    '........ORRO.OO...',
    '.......ORrRO......',
    '......ORO.ORO.....',
    '......OO..OO......',
    '..................'
  ],
  w1: [
    '..................',
    '..................',
    '.......OO.........',
    '.....OOKKOO.......',
    '....OKBKKKOO......',
    '....OKKFFKkO......',
    '...OOSSSOKkkO.....',
    '..OSSSSSORRkO.....',
    '..OSASSSORRkOO....',
    '..OSSSSSOKKkOaO...',
    '..OSSSSSOKKkOAOO..',
    '...OSSSOORRkOMaO..',
    '....OOO.ORRkOMMO..',
    '........ORRO.OO...',
    '........ORRO......',
    '........ORrRO.....',
    '.......ORO.OO.....',
    '.......OO.........'
  ],
  atk: [
    '..................',
    '..................',
    '.......OO.........',
    '.....OOKKOO.......',
    '....OKBKKKOO......',
    '....OKKFFKkO......',
    '...OOSSSOKkkO.....',
    '..OSSSSSORRkO.....',
    '..OSASSSORRkO.....',
    '..OSSSSSOKKkO.....',
    '..OSSSSSOKKkOOO...',
    '...OSSSOORRRRMMOO.',
    '....OOO.ORRROAAAO.',
    '........ORROOOOO..',
    '.......ORrRO......',
    '......ORO.ORO.....',
    '......OO..OO......',
    '..................'
  ]
};

const SOUTH_EAST: DirectionFrames = {
  w0: [
    '..................',
    '..................',
    '.......OOO........',
    '.....OOKKKOO......',
    '....OKBKKKBKO.....',
    '....OKKFFKKkO.....',
    '..OOSSSOKKKkOO....',
    '.OSSSSSORRRkkO....',
    '.OSASSSORRRkkOO...',
    '.OSSSSSOKKKkOaO...',
    '.OSSSSSOKKKkOAOO..',
    '..OSSSOORRRkOMaO..',
    '...OOO.ORRROMMO...',
    '.......ORRRO.OO...',
    '.......ORrRO......',
    '......ORO.ORO.....',
    '......OO..OO......',
    '..................'
  ],
  w1: [
    '..................',
    '..................',
    '.......OOO........',
    '.....OOKKKOO......',
    '....OKBKKKBKO.....',
    '....OKKFFKKkO.....',
    '..OOSSSOKKKkOO....',
    '.OSSSSSORRRkkO....',
    '.OSASSSORRRkkOO...',
    '.OSSSSSOKKKkOaO...',
    '.OSSSSSOKKKkOAOO..',
    '..OSSSOORRRkOMaO..',
    '...OOO.ORRROMMO...',
    '.......ORRRO.OO...',
    '........ORRO......',
    '........ORrRO.....',
    '.......ORO.OO.....',
    '.......OO.........'
  ],
  atk: [
    '..................',
    '..................',
    '.......OOO........',
    '.....OOKKKOO......',
    '....OKBKKKBKO.....',
    '....OKKFFKKkO.....',
    '..OOSSSOKKKkOO....',
    '.OSSSSSORRRkkO....',
    '.OSASSSORRRkkO....',
    '.OSSSSSOKKKkOOO...',
    '.OSSSSSOKKKRRMMOO.',
    '..OSSSOORRRROAAAO.',
    '...OOO.ORRROOOOO..',
    '.......ORRRO......',
    '......ORrRRO......',
    '.....ORO..ORO.....',
    '.....OO....OO.....',
    '..................'
  ]
};

const SOUTH: DirectionFrames = {
  w0: [
    '..................',
    '..................',
    '.......OOOO.......',
    '.....OOKKKKOO.....',
    '....OKBKKKKBKO....',
    '....OKKFFFFKKO....',
    '..OMMMO.KKOSSSOO..',
    '..OMAMO.RROSSSSSO.',
    '..OMMMO.RROSASSSO.',
    '....MO.OKKOSSSSSO.',
    '....MO.OKKOSSSSSO.',
    '....MO.ORROOSSSO..',
    '....OO.ORRROOOOO..',
    '......ORRRRO......',
    '.....ORrOOrRO.....',
    '.....ORO..ORO.....',
    '.....OO....OO.....',
    '..................'
  ],
  w1: [
    '..................',
    '..................',
    '.......OOOO.......',
    '.....OOKKKKOO.....',
    '....OKBKKKKBKO....',
    '....OKKFFFFKKO....',
    '..OMMMO.KKOSSSOO..',
    '..OMAMO.RROSSSSSO.',
    '..OMMMO.RROSASSSO.',
    '....MO.OKKOSSSSSO.',
    '....MO.OKKOSSSSSO.',
    '....MO.ORROOSSSO..',
    '....OO.ORRROOOOO..',
    '.......ORRRO......',
    '.......ORrRO......',
    '......ORO.ORO.....',
    '......OO..OO......',
    '..................'
  ],
  atk: [
    '..................',
    '.........OO.......',
    '.......OOMMOO.....',
    '.....OOKKAAAO.....',
    '....OKBKKMMBKO....',
    '....OKKFFFFKKO....',
    '..OMMO..KKOSSSOO..',
    '..OMMO..RROSSSSSO.',
    '..OMMO..RROSASSSO.',
    '..OMMO..KKOSSSSSO.',
    '..OMMO..KKOSSSSSO.',
    '...MO..ORROOSSSO..',
    '...OO..ORRROOOOO..',
    '......ORRRRO......',
    '.....ORrOOrRO.....',
    '.....ORO..ORO.....',
    '.....OO....OO.....',
    '..................'
  ]
};

const NORTH_EAST: DirectionFrames = {
  w0: [
    '..................',
    '..................',
    '.......OOO........',
    '.....OOKKKOO......',
    '....OKBKKKBKO.....',
    '....OKKKKKKkO.....',
    '..OOSSSOKKKkOO....',
    '.OSSSSSORRRkkO....',
    '.OSASSSORRRkkOO...',
    '.OSSSSSOKKKkOaO...',
    '.OSSSSSOKKKkOAOO..',
    '..OSSSOORRRkOMaO..',
    '...OOO.ORRROMMO...',
    '.......ORRRO.OO...',
    '.......ORrRO......',
    '......ORO.ORO.....',
    '......OO..OO......',
    '..................'
  ],
  w1: [
    '..................',
    '..................',
    '.......OOO........',
    '.....OOKKKOO......',
    '....OKBKKKBKO.....',
    '....OKKKKKKkO.....',
    '..OOSSSOKKKkOO....',
    '.OSSSSSORRRkkO....',
    '.OSASSSORRRkkOO...',
    '.OSSSSSOKKKkOaO...',
    '.OSSSSSOKKKkOAOO..',
    '..OSSSOORRRkOMaO..',
    '...OOO.ORRROMMO...',
    '.......ORRRO.OO...',
    '........ORRO......',
    '........ORrRO.....',
    '.......ORO.OO.....',
    '.......OO.........'
  ],
  atk: [
    '..................',
    '..................',
    '.......OOO........',
    '.....OOKKKOO......',
    '....OKBKKKBKO.....',
    '....OKKKKKKkO.....',
    '..OOSSSOKKKkOO....',
    '.OSSSSSORRRkkO....',
    '.OSASSSORRRkkO....',
    '.OSSSSSOKKKkOOO...',
    '.OSSSSSOKKKRRMMOO.',
    '..OSSSOORRRROAAAO.',
    '...OOO.ORRROOOOO..',
    '.......ORRRO......',
    '......ORrRRO......',
    '.....ORO..ORO.....',
    '.....OO....OO.....',
    '..................'
  ]
};

const NORTH: DirectionFrames = {
  w0: [
    '..................',
    '..................',
    '.......OOOO.......',
    '.....OOKKKKOO.....',
    '....OKBKKKKBKO....',
    '....OKKKKKKKKO....',
    '..OMMMO.KKOSSSOO..',
    '..OMAMO.RROSSSSSO.',
    '..OMMMO.RROSASSSO.',
    '....MO.OKKOSSSSSO.',
    '....MO.OKKOSSSSSO.',
    '....MO.ORROOSSSO..',
    '....OO.ORRROOOOO..',
    '......ORRRRO......',
    '.....ORrOOrRO.....',
    '.....ORO..ORO.....',
    '.....OO....OO.....',
    '..................'
  ],
  w1: [
    '..................',
    '..................',
    '.......OOOO.......',
    '.....OOKKKKOO.....',
    '....OKBKKKKBKO....',
    '....OKKKKKKKKO....',
    '..OMMMO.KKOSSSOO..',
    '..OMAMO.RROSSSSSO.',
    '..OMMMO.RROSASSSO.',
    '....MO.OKKOSSSSSO.',
    '....MO.OKKOSSSSSO.',
    '....MO.ORROOSSSO..',
    '....OO.ORRROOOOO..',
    '.......ORRRO......',
    '.......ORrRO......',
    '......ORO.ORO.....',
    '......OO..OO......',
    '..................'
  ],
  atk: [
    '..................',
    '.........OO.......',
    '.......OOMMOO.....',
    '.....OOKKAAAO.....',
    '....OKBKKMMBKO....',
    '....OKKKKKKKKO....',
    '..OMMO..KKOSSSOO..',
    '..OMMO..RROSSSSSO.',
    '..OMMO..RROSASSSO.',
    '..OMMO..KKOSSSSSO.',
    '..OMMO..KKOSSSSSO.',
    '...MO..ORROOSSSO..',
    '...OO..ORRROOOOO..',
    '......ORRRRO......',
    '.....ORrOOrRO.....',
    '.....ORO..ORO.....',
    '.....OO....OO.....',
    '..................'
  ]
};

const POSES: readonly Pose[] = ['w0', 'w1', 'atk'];

function flip(frames: DirectionFrames): DirectionFrames {
  return { w0: mirror(frames.w0), w1: mirror(frames.w1), atk: mirror(frames.atk) };
}

const DIRECTIONS: readonly DirectionFrames[] = [
  EAST,
  SOUTH_EAST,
  SOUTH,
  flip(SOUTH_EAST),
  flip(EAST),
  flip(NORTH_EAST),
  NORTH,
  NORTH_EAST
];

function expand2x(rows: readonly string[]): string[] {
  return rows.flatMap((row) => {
    const doubled = [...row].map((pixel) => pixel.repeat(2)).join('');
    return [doubled, doubled];
  });
}

export function buildSentinelPack(): Map<string, Uint8Array> {
  const pack = new Map<string, Uint8Array>();
  const render = (key: string, logicalRows: readonly string[]): void => {
    const bitmap = rasterize(expand2x(logicalRows), SENTINEL_PALETTE, key);
    if (bitmap.w !== 36 || bitmap.h !== 36) {
      throw new Error(`${key}: frame is ${bitmap.w}x${bitmap.h}, expected 36x36`);
    }
    pack.set(key, encodePng(bitmap));
  };

  DIRECTIONS.forEach((frames, dir) => {
    for (const pose of POSES) render(`hero-sentinel-${dir}-${pose}`, frames[pose]);
  });
  render('hero-sentinel', SOUTH.w0);
  return pack;
}
