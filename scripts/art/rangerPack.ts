import { encodePng, mirror, rasterize, type Palette } from './pixels';

/**
 * Tamsin Vael, the Ranger — the hand-drawn hero pack for issue #27.
 *
 * Every frame below is drawn pixel by pixel, one character per pixel, in the
 * palette declared just under this comment. Nothing is procedural: this is the
 * art, checked in as text so a reviewer can read a silhouette change in a diff
 * instead of squinting at 25 binary blobs. `npm run art:build` encodes it into
 * `public/art/hero-ranger-*.png`, which the drop-in loader picks up with no
 * game-code change at all (`docs/ART.md`).
 *
 * Design rules the frames are drawn against, from `docs/ART.md` and
 * `docs/design/visual-direction.md`:
 *
 * - 36x36, transparent, no baked shadow, vignette, or player accent — the
 *   renderer layers all three, so anything baked in would double up.
 * - The silhouette carries the read at 1x: pointed hood, cloak flare, the
 *   stave's long vertical, fletchings breaking the shoulder line. Tamsin has
 *   to be tellable from Korrin's pauldrons-and-blade at a glance in a horde.
 * - Original hive-fantasy work: mossed leathers and thorn-fletched shafts, no
 *   reference to any existing game's ranger.
 *
 * Only five directions are drawn. East/west, SE/SW and NE/NW are mirrors of
 * each other — the same trick the Vanguard and Arcanist packs use, and it is
 * safe here because nothing in the design is handed.
 */

/** `.` is transparent. Twelve inks, in the hive palette. */
export const RANGER_PALETTE: Palette = {
  O: '#14210f', // outline — near-black green, the whole figure is ringed in it
  H: '#6faa62', // hood, lit crown
  h: '#4c7f4a', // hood and sleeves, mid
  d: '#2f5533', // cloak shadow, hem
  L: '#a9773f', // jerkin leather, lit
  l: '#6d472a', // jerkin leather, shadow
  S: '#d7a273', // skin, lit
  s: '#a2724d', // skin inside the hood
  W: '#caa66a', // bow stave and shafts
  G: '#e8e2d0', // bowstring
  P: '#9fe06a', // spore-green thorn fletching — the one bioluminescent note
  b: '#3a2c1e' // belt and boots
};

const SIZE = 36;

type Pose = 'w0' | 'w1' | 'atk';
type DirectionFrames = Record<Pose, readonly string[]>;

/**
 * Profile facing +x: the hood tail streams behind, the quiver rides the far
 * shoulder, and the stave stands ahead of the leading foot.
 */
const EAST: DirectionFrames = {
  // walk, leading foot planted
  w0: [
    '....................................',
    '....................................',
    '...............OOO..................',
    '.............OOhhhhO................',
    '........PO..OhhhHHhO................',
    '......POPO.OhhhhHHhO................',
    '......POWO.OhhhhhHhhO...............',
    '......WOWO.OhhhhhOssO...............',
    '......WO..OhhhhhhOPsSO..............',
    '.......OLLOhhhhhhOssSO..............',
    '........OLLOhhhhhOsSSO..............',
    '.........OLLOhhhhOSSO...WO..........',
    '.........OLOOdhhhhOSO...WO..........',
    '..........OLOddhhhhhhdO.GWO.........',
    '..........OOOddhhhhhhdO.GWO.........',
    '............OdhhLLLLLhO.G.WO........',
    '............OdhhLllllLSSO.WO........',
    '............OdhhLllllLSSO.WO........',
    '............OdhhLllllLO.G.WO........',
    '............OdhhbbbbbbO.G.WO........',
    '............OdhhLllllLO.GWO.........',
    '.............OdhLllllLO.GWO.........',
    '.............OddLllllLO.WO..........',
    '.............OdddLLLLdO.WO..........',
    '.............OllO..OllO.............',
    '.............OllO..OllO.............',
    '............OllO....OllO............',
    '............OllO....OllO............',
    '...........OllO......OllO...........',
    '...........ObbO......ObbO...........',
    '..........ObbbO......ObbbO..........',
    '..........OOOOO......OOOOO..........',
    '....................................',
    '....................................',
    '....................................',
    '....................................'
  ],
  // walk, weight passing through
  w1: [
    '....................................',
    '....................................',
    '...............OOO..................',
    '.............OOhhhhO................',
    '........PO..OhhhHHhO................',
    '......POPO.OhhhhHHhO................',
    '......POWO.OhhhhhHhhO...............',
    '......WOWO.OhhhhhOssO...............',
    '......WO..OhhhhhhOPsSO..............',
    '.......OLLOhhhhhhOssSO..............',
    '........OLLOhhhhhOsSSO..............',
    '.........OLLOhhhhOSSO...WO..........',
    '.........OLOOdhhhhOSO...WO..........',
    '..........OLOddhhhhhhdO.GWO.........',
    '..........OOOddhhhhhhdO.GWO.........',
    '............OdhhLLLLLhO.G.WO........',
    '............OdhhLllllLSSO.WO........',
    '............OdhhLllllLSSO.WO........',
    '............OdhhLllllLO.G.WO........',
    '............OdhhbbbbbbO.G.WO........',
    '............OdhhLllllLO.GWO.........',
    '.............OdhLllllLO.GWO.........',
    '.............OddLllllLO.WO..........',
    '.............OdddLLLLdO.WO..........',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '.............ObbbO.ObbO.............',
    '.............OOOOO.ObbbO............',
    '...................OOOOO............',
    '....................................',
    '....................................',
    '....................................',
    '....................................'
  ],
  // loosing: stance braced, stave at arm’s length, string hauled back
  atk: [
    '....................................',
    '....................................',
    '...............OOO..................',
    '.............OOhhhhO................',
    '........PO..OhhhHHhO................',
    '......POPO.OhhhhHHhO................',
    '......POWO.OhhhhhHhhO...............',
    '......WOWO.OhhhhhOssO....OO.........',
    '......WO..OhhhhhhOPsSO..GWO.........',
    '.......OLLOhhhhhhOssSO.G.WO.........',
    '........OLLOhhhhhOsSSOG...WO........',
    '.........OLLOhhhhOSSSO.....WO.......',
    '.........OLOOdhhhhOSSWWWWWWWWWPPO...',
    '..........OLOddhhhhhGOOOOOOOOO......',
    '..........OOOddhhhhhhGO.....WO......',
    '............OdhhLLLLLhG.....WO......',
    '............OdhhLllllLOGSSSSWO......',
    '............OdhhLllllLO.OOOOWO......',
    '............OdhhLllllLO.G...WO......',
    '............OdhhbbbbbbO.G..WO.......',
    '............OdhhLllllLO.G..WO.......',
    '.............OdhLllllLO.G.WO........',
    '.............OddLllllLO.GWO.........',
    '.............OdddLLLLdO..WO.........',
    '............OllO....OllO.OO.........',
    '...........OllO.....OllO............',
    '...........OllO......OllO...........',
    '..........OllO.......OllO...........',
    '..........OllO........OllO..........',
    '.........ObbO.........ObbO..........',
    '........ObbbO.........ObbbO.........',
    '........OOOOO.........OOOOO.........',
    '....................................',
    '....................................',
    '....................................',
    '....................................'
  ]
};

/**
 * Three-quarter front: the hood mouth swings toward the facing so only the near
 * cheek catches light, and the stride runs on the diagonal.
 */
const SOUTH_EAST: DirectionFrames = {
  // walk, leading foot planted
  w0: [
    '....................................',
    '....................................',
    '................OO..................',
    '............P.OhhhO.................',
    '..........POPOhhHHhhO...............',
    '.........OPOOhhHHHHhhO..............',
    '.........OWOOhhhhOOOOhO.............',
    '.........OWOOhhhhOssSOhO............',
    '.........OWOOhhhhOsPSOhO............',
    '.........OWOOhhhhOsSSOhO............',
    '.........OWOOhhhhOSSSOhO............',
    '.........OO.OdhhhhOOOhdO............',
    '...........OddhhhhhhhhddO.WO........',
    '...........OddhhhhhhhhddO.WO........',
    '...........OdhhOLLLLLOhdO.GWO.......',
    '...........OdhhOLlllLOhdO.GWO.......',
    '...........OdhhOLlllLOhdO.G.WO......',
    '...........OdhhOLlllLOhdhhO.WO......',
    '...........OdhhOLlllLOhdhSSSSO......',
    '...........OdhhObbbbbOhdOOOOWO......',
    '...........OdSSOLlllLOSSO.G.WO......',
    '............OOOhLlllLOOO..GWO.......',
    '.............OdhLlllLdO...GWO.......',
    '.............OddhLLLddO...WO........',
    '..............OllO.OllO...WO........',
    '..............OllO.OllO.............',
    '..............OllO..OllO............',
    '.............OllO...OllO............',
    '.............ObbO...OllO............',
    '............ObbbO...OllO............',
    '............OOOOO...ObbO............',
    '....................ObbbO...........',
    '....................OOOOO...........',
    '....................................',
    '....................................',
    '....................................'
  ],
  // walk, weight passing through
  w1: [
    '....................................',
    '....................................',
    '................OO..................',
    '............P.OhhhO.................',
    '..........POPOhhHHhhO...............',
    '.........OPOOhhHHHHhhO..............',
    '.........OWOOhhhhOOOOhO.............',
    '.........OWOOhhhhOssSOhO............',
    '.........OWOOhhhhOsPSOhO............',
    '.........OWOOhhhhOsSSOhO............',
    '.........OWOOhhhhOSSSOhO............',
    '.........OO.OdhhhhOOOhdO............',
    '...........OddhhhhhhhhddO.WO........',
    '...........OddhhhhhhhhddO.WO........',
    '...........OdhhOLLLLLOhdO.GWO.......',
    '...........OdhhOLlllLOhdO.GWO.......',
    '...........OdhhOLlllLOhdO.G.WO......',
    '...........OdhhOLlllLOhdhhO.WO......',
    '...........OdhhOLlllLOhdhSSSSO......',
    '...........OdhhObbbbbOhdOOOOWO......',
    '...........OdSSOLlllLOSSO.G.WO......',
    '............OOOhLlllLOOO..GWO.......',
    '.............OdhLlllLdO...GWO.......',
    '.............OddhLLLddO...WO........',
    '..............OllO.OllO...WO........',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.ObbO.............',
    '..............OllOObbbO.............',
    '..............ObbOOOOOO.............',
    '.............ObbbO..................',
    '.............OOOOO..................',
    '....................................',
    '....................................',
    '....................................'
  ],
  // loosing: stance braced, stave at arm’s length, string hauled back
  atk: [
    '....................................',
    '....................................',
    '................OO..................',
    '............P.OhhhO.................',
    '..........POPOhhHHhhO...............',
    '.........OPOOhhHHHHhhO..............',
    '.........OWOOhhhhOOOOhO.............',
    '.........OWOOhhhhOssSOhO............',
    '.........OWOOhhhhOsPSOhO............',
    '.........OWOOhhhhOsSSOhO............',
    '.........OWOOhhhhOSSSOhO...WO.......',
    '.........OO.OdhhhhOOOhdO...GO.......',
    '...........OddhhhhhhhhddO..GWO......',
    '...........OddhhhhhhhhddO.G.WO......',
    '...........OdhhOLLLLLOhdO.G..WO.....',
    '...........OdhhOLlllLOhdWG...WO.....',
    '...........OdhhOLlllLOhSSWW..WO.....',
    '...........OdhhOLlllLOhSS..WWWO.....',
    '...........OdhhOLlllLOOOG....WW.....',
    '...........OdhhObbbbbOhdOG...WOPP...',
    '...........OdSSOLlllLOSSO.G..WO.....',
    '............OOOhLlllLOOO..G.WO......',
    '.............OdhLlllLdO....GWO......',
    '.............OddhLLLddO....GO.......',
    '.............OllO...OllO...WO.......',
    '.............OllO...OllO............',
    '............OllO.....OllO...........',
    '............OllO.....OllO...........',
    '...........OllO.......OllO..........',
    '...........ObbO.......ObbO..........',
    '..........ObbbO.......ObbbO.........',
    '..........OOOOO.......OOOOO.........',
    '....................................',
    '....................................',
    '....................................',
    '....................................'
  ]
};

/**
 * Facing the camera: full hood mouth, two fletchings over the right shoulder,
 * the stave carried at the left hand.
 */
const SOUTH: DirectionFrames = {
  // walk, leading foot planted
  w0: [
    '....................................',
    '....................................',
    '.................OO.................',
    '............P..OhhhO................',
    '..........POP.OhhHHhhO..............',
    '.........OPOWOhhHHHHhhO.............',
    '.........OWOWOhhOOOOhhO.............',
    '.........OWOWOhOssssOhO.............',
    '.........OWOWOhOsPPsOhO.............',
    '.........OWOWOhOssssOhO.............',
    '.........OWOWOhhOSSOhhO....WO.......',
    '.........OWOOdhhhOOhhhdO...WO.......',
    '.........OOOddhhhhhhhhddO..GWO......',
    '...........OddhhhhhhhhddO..GWO......',
    '...........OdhOLLLLLLOhdO..G.WO.....',
    '...........OdhOLllllLOhdO..G.WO.....',
    '...........OdhOLllllLOhdO..G.WO.....',
    '...........OdhOLllllLOhdhhOG.WO.....',
    '...........OdhOLllllLOhdhSSSSSO.....',
    '...........OdhObbbbbbOhdOOOO.WO.....',
    '...........OSSOLllllLOSSO..G.WO.....',
    '............OOOLllllLOOO...GWO......',
    '.............OdLllllLdO....GWO......',
    '.............OddLLLLddO....WO.......',
    '..............OllO.OllO....WO.......',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............ObbO.OllO.............',
    '.............ObbbO.OllO.............',
    '.............OOOOO.ObbO.............',
    '...................ObbbO............',
    '...................OOOOO............',
    '....................................',
    '....................................',
    '....................................'
  ],
  // walk, weight passing through
  w1: [
    '....................................',
    '....................................',
    '.................OO.................',
    '............P..OhhhO................',
    '..........POP.OhhHHhhO..............',
    '.........OPOWOhhHHHHhhO.............',
    '.........OWOWOhhOOOOhhO.............',
    '.........OWOWOhOssssOhO.............',
    '.........OWOWOhOsPPsOhO.............',
    '.........OWOWOhOssssOhO.............',
    '.........OWOWOhhOSSOhhO....WO.......',
    '.........OWOOdhhhOOhhhdO...WO.......',
    '.........OOOddhhhhhhhhddO..GWO......',
    '...........OddhhhhhhhhddO..GWO......',
    '...........OdhOLLLLLLOhdO..G.WO.....',
    '...........OdhOLllllLOhdO..G.WO.....',
    '...........OdhOLllllLOhdO..G.WO.....',
    '...........OdhOLllllLOhdhhOG.WO.....',
    '...........OdhOLllllLOhdhSSSSSO.....',
    '...........OdhObbbbbbOhdOOOO.WO.....',
    '...........OSSOLllllLOSSO..G.WO.....',
    '............OOOLllllLOOO...GWO......',
    '.............OdLllllLdO....GWO......',
    '.............OddLLLLddO....WO.......',
    '..............OllO.OllO....WO.......',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.ObbO.............',
    '..............OllOObbbO.............',
    '..............ObbOOOOOO.............',
    '.............ObbbO..................',
    '.............OOOOO..................',
    '....................................',
    '....................................',
    '....................................'
  ],
  // loosing: stance braced, stave at arm’s length, string hauled back
  atk: [
    '....................................',
    '....................................',
    '.................OO.................',
    '............P..OhhhO................',
    '..........POP.OhhHHhhO..............',
    '.........OPOWOhhHHHHhhO.............',
    '.........OWOWOhhOOOOhhO.............',
    '.........OWOWOhOssssOhO.............',
    '.........OWOWOhOsPPsOhO.............',
    '.........OWOWOhOssssOhO.....WO......',
    '.........OWOWOhhOSSOhhO.....GO......',
    '.........OWOOdhhhOOhhhdO....GWO.....',
    '.........OOOddhhhhhhhhddO..G.WO.....',
    '...........OddhhhhhhhhddO..G..WO....',
    '...........OdhOLLLLLLOhdO.G...WO....',
    '...........OdhOLllllLOhdO.G...WO....',
    '...........OdhOLllllLOhdhhO...WO....',
    '...........OdhOLllllLOhSSSSSSSWO....',
    '...........OdhOLllllLOhSSO....WO....',
    '...........OdhObbbbbbOOOO.G...WO....',
    '...........OSSOLllllLOSSO.G...WO....',
    '............OOOLllllLOOO...G..WO....',
    '.............OdLllllLdO....G.WO.....',
    '.............OddLLLLddO.....GWO.....',
    '.............OllO...OllO....GO......',
    '.............OllO...OllO....WO......',
    '.............OllO...OllO............',
    '............OllO....OllO............',
    '............OllO.....OllO...........',
    '............ObbO.....ObbO...........',
    '...........ObbbO.....ObbbO..........',
    '...........OOOOO.....OOOOO..........',
    '....................................',
    '....................................',
    '....................................',
    '....................................'
  ]
};

/**
 * Three-quarter back: hood closed, the quiver strap reading as a diagonal across
 * the shoulders, a sliver of jaw on the leading side.
 */
const NORTH_EAST: DirectionFrames = {
  // walk, leading foot planted
  w0: [
    '....................................',
    '....................................',
    '................OO..................',
    '..............OhhhO.................',
    '........PO...OhHHHhO................',
    '........POPOOhHHHHHhO...............',
    '........WOPOOhhHHHHhhO..............',
    '........WOWOOhhhhHhhhsO.............',
    '........OLLLOhhhhHhhhsO.............',
    '.........OLllOhhhhhhhSO.............',
    '..........OLllOdddddddO.............',
    '...........OLllOOOOOOOO.............',
    '...........OOLllOhhhhhddO.WO........',
    '...........OdOLllOhhhhddO.WO........',
    '...........OdhOLllOhhhhdO.GWO.......',
    '...........OdhhOLllOhhhdO.GWO.......',
    '...........OdhhhOLlOhhhdO.G.WO......',
    '...........OdhhhhOLOhhhdOhO.WO......',
    '...........OdhhhhhhhhhhdOSSSSO......',
    '...........OdhbbbbbbbbhdOOOOWO......',
    '...........OdSShhhhhhdSSO.G.WO......',
    '............OOdhhhhhhdOO..GWO.......',
    '.............OdhhhhhhdO...GWO.......',
    '.............OddddddddO...WO........',
    '..............OllO.OllO...WO........',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............ObbO.OllO.............',
    '.............ObbbO.OllO.............',
    '.............OOOOO.ObbO.............',
    '...................ObbbO............',
    '...................OOOOO............',
    '....................................',
    '....................................',
    '....................................'
  ],
  // walk, weight passing through
  w1: [
    '....................................',
    '....................................',
    '................OO..................',
    '..............OhhhO.................',
    '........PO...OhHHHhO................',
    '........POPOOhHHHHHhO...............',
    '........WOPOOhhHHHHhhO..............',
    '........WOWOOhhhhHhhhsO.............',
    '........OLLLOhhhhHhhhsO.............',
    '.........OLllOhhhhhhhSO.............',
    '..........OLllOdddddddO.............',
    '...........OLllOOOOOOOO.............',
    '...........OOLllOhhhhhddO.WO........',
    '...........OdOLllOhhhhddO.WO........',
    '...........OdhOLllOhhhhdO.GWO.......',
    '...........OdhhOLllOhhhdO.GWO.......',
    '...........OdhhhOLlOhhhdO.G.WO......',
    '...........OdhhhhOLOhhhdOhO.WO......',
    '...........OdhhhhhhhhhhdOSSSSO......',
    '...........OdhbbbbbbbbhdOOOOWO......',
    '...........OdSShhhhhhdSSO.G.WO......',
    '............OOdhhhhhhdOO..GWO.......',
    '.............OdhhhhhhdO...GWO.......',
    '.............OddddddddO...WO........',
    '..............OllO.OllO...WO........',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.ObbO.............',
    '..............OllOObbbO.............',
    '..............ObbOOOOOO.............',
    '.............ObbbO..................',
    '.............OOOOO..................',
    '....................................',
    '....................................',
    '....................................'
  ],
  // loosing: stance braced, stave at arm’s length, string hauled back
  atk: [
    '....................................',
    '....................................',
    '................OO..................',
    '..............OhhhO.................',
    '........PO...OhHHHhO................',
    '........POPOOhHHHHHhO...............',
    '........WOPOOhhHHHHhhO..............',
    '........WOWOOhhhhHhhhsO.............',
    '........OLLLOhhhhHhhhsO.............',
    '.........OLllOhhhhhhhSO.............',
    '..........OLllOdddddddO....WO.......',
    '...........OLllOOOOOOOO....GO.......',
    '...........OOLllOhhhhhddO..GWO......',
    '...........OdOLllOhhhhddO.G.WO......',
    '...........OdhOLllOhhhhdO.G..WO.....',
    '...........OdhhOLllOhhhdWG...WO.....',
    '...........OdhhhOLlOhhhSSWW..WO.....',
    '...........OdhhhhOLOhhhSS..WWWO.....',
    '...........OdhhhhhhhhhOOG....WW.....',
    '...........OdhbbbbbbbbhdOG...WOPP...',
    '...........OdSShhhhhhdSSO.G..WO.....',
    '............OOdhhhhhhdOO..G.WO......',
    '.............OdhhhhhhdO....GWO......',
    '.............OddddddddO....GO.......',
    '.............OllO...OllO...WO.......',
    '.............OllO...OllO............',
    '............OllO.....OllO...........',
    '............OllO.....OllO...........',
    '...........OllO.......OllO..........',
    '...........ObbO.......ObbO..........',
    '..........ObbbO.......ObbbO.........',
    '..........OOOOO.......OOOOO.........',
    '....................................',
    '....................................',
    '....................................',
    '....................................'
  ]
};

/**
 * Walking away: no face at all, the quiver at full length down the back, the
 * stave carried on the far side.
 */
const NORTH: DirectionFrames = {
  // walk, leading foot planted
  w0: [
    '....................................',
    '....................................',
    '.................OO.................',
    '...............OhhhO................',
    '..............OhHHHhPO..............',
    '.............OhHHHHHPOPO............',
    '.............OhhHHHHWOPO............',
    '.............OhhhhHhWOWO............',
    '.............OhhhhHOLLLO............',
    '.............OhhhhHOLllO............',
    '.......OW....OddddOLllOO............',
    '.......OW...OOOOOOOLllOO............',
    '......OWG..OddhhhOLllOddO...........',
    '......OWG..OddhhhOLllOddO...........',
    '.....OW.G..OdhhhOLllOhhdO...........',
    '.....OW.G..OdhhhOLllOhhdO...........',
    '.....OW.G..OdhhOLllOhhhdO...........',
    '.....OW.GOhOdhhOLlOhhhhdO...........',
    '.....OSSSSSOdhOLOhhhhhhdO...........',
    '.....OW.OOOOdhbbbbbbbbhdO...........',
    '.....OW.G..OSSdhhhhhhdSSO...........',
    '......OWG...OOdhhhhhhdOO............',
    '......OWG....OdhhhhhhdO.............',
    '.......OW....OddddddddO.............',
    '.......OW.....OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............ObbO.OllO.............',
    '.............ObbbO.OllO.............',
    '.............OOOOO.ObbO.............',
    '...................ObbbO............',
    '...................OOOOO............',
    '....................................',
    '....................................',
    '....................................'
  ],
  // walk, weight passing through
  w1: [
    '....................................',
    '....................................',
    '.................OO.................',
    '...............OhhhO................',
    '..............OhHHHhPO..............',
    '.............OhHHHHHPOPO............',
    '.............OhhHHHHWOPO............',
    '.............OhhhhHhWOWO............',
    '.............OhhhhHOLLLO............',
    '.............OhhhhHOLllO............',
    '.......OW....OddddOLllOO............',
    '.......OW...OOOOOOOLllOO............',
    '......OWG..OddhhhOLllOddO...........',
    '......OWG..OddhhhOLllOddO...........',
    '.....OW.G..OdhhhOLllOhhdO...........',
    '.....OW.G..OdhhhOLllOhhdO...........',
    '.....OW.G..OdhhOLllOhhhdO...........',
    '.....OW.GOhOdhhOLlOhhhhdO...........',
    '.....OSSSSSOdhOLOhhhhhhdO...........',
    '.....OW.OOOOdhbbbbbbbbhdO...........',
    '.....OW.G..OSSdhhhhhhdSSO...........',
    '......OWG...OOdhhhhhhdOO............',
    '......OWG....OdhhhhhhdO.............',
    '.......OW....OddddddddO.............',
    '.......OW.....OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.OllO.............',
    '..............OllO.ObbO.............',
    '..............OllOObbbO.............',
    '..............ObbOOOOOO.............',
    '.............ObbbO..................',
    '.............OOOOO..................',
    '....................................',
    '....................................',
    '....................................'
  ],
  // loosing: stance braced, stave at arm’s length, string hauled back
  atk: [
    '....................................',
    '....................................',
    '.................OO.................',
    '...............OhhhO................',
    '..............OhHHHhPO..............',
    '.............OhHHHHHPOPO............',
    '.............OhhHHHHWOPO............',
    '.............OhhhhHhWOWO............',
    '.............OhhhhHOLLLO............',
    '......OW.....OhhhhHOLllO............',
    '......OG.....OddddOLllOO............',
    '.....OWG....OOOOOOOLllOO............',
    '.....OW.G..OddhhhOLllOddO...........',
    '....OW..G..OddhhhOLllOddO...........',
    '....OW...G.OdhhhOLllOhhdO...........',
    '....OW...G.OdhhhOLllOhhdO...........',
    '....OW...OhhdhhOLllOhhhdO...........',
    '....OWSSSSSSShhOLlOhhhhdO...........',
    '....OW....OSShOLOhhhhhhdO...........',
    '....OW...G.OOObbbbbbbbhdO...........',
    '....OW...G.OSSdhhhhhhdSSO...........',
    '....OW..G...OOdhhhhhhdOO............',
    '.....OW.G....OdhhhhhhdO.............',
    '.....OWG.....OddddddddO.............',
    '......OG.....OllO...OllO............',
    '......OW.....OllO...OllO............',
    '.............OllO...OllO............',
    '............OllO....OllO............',
    '............OllO.....OllO...........',
    '............ObbO.....ObbO...........',
    '...........ObbbO.....ObbbO..........',
    '...........OOOOO.....OOOOO..........',
    '....................................',
    '....................................',
    '....................................',
    '....................................'
  ]
};

/**
 * Directions run 0 = east, clockwise. The three that are not drawn are flips
 * of the three-quarter and profile frames opposite them.
 */
const DIRECTIONS: readonly DirectionFrames[] = [
  EAST, // 0 east
  SOUTH_EAST, // 1 south-east
  SOUTH, // 2 south
  flip(SOUTH_EAST), // 3 south-west
  flip(EAST), // 4 west
  flip(NORTH_EAST), // 5 north-west
  NORTH, // 6 north
  NORTH_EAST // 7 north-east
];

const POSES: readonly Pose[] = ['w0', 'w1', 'atk'];

function flip(frames: DirectionFrames): DirectionFrames {
  return { w0: mirror(frames.w0), w1: mirror(frames.w1), atk: mirror(frames.atk) };
}

/**
 * The pack, keyed exactly as `TEXTURE_SPECS` and `public/art/manifest.json`
 * name it. `hero-ranger` (no suffix) is the menu portrait, which docs/ART.md
 * defines as a copy of the south idle frame.
 */
export function buildRangerPack(): Map<string, Uint8Array> {
  const pack = new Map<string, Uint8Array>();
  const render = (key: string, rows: readonly string[]): void => {
    const bitmap = rasterize(rows, RANGER_PALETTE, key);
    if (bitmap.w !== SIZE || bitmap.h !== SIZE) {
      throw new Error(`${key}: frame is ${bitmap.w}x${bitmap.h}, expected ${SIZE}x${SIZE}`);
    }
    pack.set(key, encodePng(bitmap));
  };

  DIRECTIONS.forEach((frames, dir) => {
    for (const pose of POSES) render(`hero-ranger-${dir}-${pose}`, frames[pose]);
  });
  render('hero-ranger', SOUTH.w0);
  return pack;
}
