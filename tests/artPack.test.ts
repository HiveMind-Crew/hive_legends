import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildRangerPack } from '../scripts/art/rangerPack';
import { buildSentinelPack } from '../scripts/art/sentinelPack';
import { buildSkitterPack } from '../scripts/art/skitterPack';
import { buildHuskPack } from '../scripts/art/huskPack';
import { buildSpitterPack } from '../scripts/art/spitterPack';
import { buildMireveilPack, mireveilGrid } from '../scripts/art/mireveilPack';
import {
  amberResinTileBitmap,
  buildAmberResinTilePack,
  buildEnvironmentTilePack,
  environmentTileBitmap,
  type AmberResinTileKey,
  type EnvironmentTileKey,
  buildHollowThroneTilePack,
  hollowThroneTileBitmap,
  type HollowThroneTileKey
} from '../scripts/art/environmentTilePack';
import {
  buildHollowThroneDecorPack,
  hollowThroneDecorBitmap,
  type HollowThroneDecorKey
} from '../scripts/art/hollowThronePack';
import { buildWorldObjectPack, worldObjectBitmap, type WorldObjectKey } from '../scripts/art/worldObjectPack';
import {
  buildInteractionObjectPack,
  interactionObjectBitmap,
  type InteractionObjectKey
} from '../scripts/art/interactionObjectPack';
import { buildUiArtPack, uiArtBitmap, type UiArtKey } from '../scripts/art/uiArtPack';
import { GENERATED_FOREVER_FX_TEXTURE_KEYS, TEXTURE_SPECS } from '../src/game/textureSpecs';

/**
 * Guards the drop-in art contract in `docs/ART.md` from the one side the
 * runtime cannot: `BootScene` rejects a wrong-sized override at boot with a
 * console warning and silently falls back to generated art, and a manifest key
 * with no file behind it is only a browser 404. Neither fails a build, so a
 * broken pack would ship looking merely "not as nice as the mockup".
 *
 * Here the same rules are structural. It also keeps every grid-authored pack
 * honest against its checked-in PNGs — regenerate with `npm run art:build`.
 */
const ART_DIR = fileURLToPath(new URL('../public/art/', import.meta.url));
const MANIFEST = `${ART_DIR}manifest.json`;
const ART_DOC = fileURLToPath(new URL('../docs/ART.md', import.meta.url));

function manifestKeys(): string[] {
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as string[];
}

/** Width and height straight out of the PNG's IHDR chunk. */
function pngSize(file: string): { w: number; h: number } {
  const buf = readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

interface FxPolicyRow {
  key: string;
  size: string;
  decision: string;
  runtime: string;
  caveat: string;
}

function documentedFxPolicyRows(): FxPolicyRow[] {
  const doc = readFileSync(ART_DOC, 'utf8');
  const start = doc.indexOf('### Effects (generated forever; no PNG overrides)');
  const end = doc.indexOf('\n## ', start);
  if (start < 0 || end < 0) throw new Error('docs/ART.md is missing the generated-forever FX policy table');

  return [...doc.slice(start, end).matchAll(/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].map(
    ([, key, size, decision, runtime, caveat]) => ({
      key: key!.trim(),
      size: size!.trim(),
      decision: decision!.trim(),
      runtime: runtime!.trim(),
      caveat: caveat!.trim()
    })
  );
}

// Under `npm run art:build` the pack below is still being written, so the
// manifest it is checked against is one revision stale by definition.
describe.skipIf(process.env.UPDATE_ART)('public/art', () => {
  it('lists only real texture keys', () => {
    for (const key of manifestKeys()) {
      expect(TEXTURE_SPECS[key], `"${key}" is not a texture key — BootScene would ignore it`).toBeDefined();
    }
  });

  it('ships a correctly sized file for every key it lists', () => {
    for (const key of manifestKeys()) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `manifest lists "${key}" but ${key}.png is missing — the browser 404s`).toBe(true);
      expect(pngSize(file), `${key}.png does not match TEXTURE_SPECS`).toEqual(TEXTURE_SPECS[key]);
    }
  });

  it('lists every file it ships', () => {
    const listed = new Set(manifestKeys());
    const shipped = readdirSync(ART_DIR)
      .filter((name) => name.endsWith('.png'))
      .map((name) => name.slice(0, -4));
    for (const key of shipped) {
      expect(listed.has(key), `${key}.png is checked in but unlisted, so it never loads`).toBe(true);
    }
  });

  it('keeps the current art pack complete except for generated-forever FX', () => {
    const manifest = new Set(manifestKeys());
    const unoverridden = Object.keys(TEXTURE_SPECS)
      .filter((key) => !manifest.has(key))
      .sort();
    const generatedFx = [...GENERATED_FOREVER_FX_TEXTURE_KEYS].sort();

    // This is intentionally scoped to the current repository pack. The
    // loader still permits partial packs for future realms/content.
    expect(unoverridden).toEqual(generatedFx);
    for (const key of Object.keys(TEXTURE_SPECS).filter((key) => !key.startsWith('fx-'))) {
      expect(manifest.has(key), `${key} is a current non-FX texture without an art override`).toBe(true);
    }
  });

  it('documents the exact generated-forever FX set and sizes', () => {
    const rows = documentedFxPolicyRows();
    expect(rows.map((row) => row.key)).toEqual([...GENERATED_FOREVER_FX_TEXTURE_KEYS]);

    for (const row of rows) {
      const spec = TEXTURE_SPECS[row.key];
      expect(spec, `${row.key} is not in TEXTURE_SPECS`).toBeDefined();
      expect(row.decision, `${row.key} must remain generated forever`).toBe('Yes — generated forever');
      expect(row.size, `${row.key} size drifted from TEXTURE_SPECS`).toBe(`${spec!.w}×${spec!.h}`);
      expect(row.runtime, `${row.key} needs a runtime usage/tint note`).not.toBe('');
      expect(row.caveat, `${row.key} needs an authoring caveat`).not.toBe('');
    }
  });
});

describe('the Realm 1 environment tile pack', () => {
  const keys: readonly EnvironmentTileKey[] = [
    'tile-wall',
    'tile-wall-inner',
    'tile-wall-face',
    'tile-floor-0',
    'tile-floor-1',
    'tile-floor-2',
    'tile-floor-3'
  ];

  it('matches the reviewable pixel source', () => {
    const pack = buildEnvironmentTilePack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(readFileSync(file).equals(Buffer.from(png)), `${key}.png is stale — run \`npm run art:build\``).toBe(true);
    }
  });

  it('covers all four floors and three wall surfaces at the art-contract sizes', () => {
    expect([...buildEnvironmentTilePack().keys()]).toEqual(keys);
    for (const key of keys) {
      const image = environmentTileBitmap(key);
      expect({ w: image.w, h: image.h }).toEqual(TEXTURE_SPECS[key]);
      for (let i = 3; i < image.rgba.length; i += 4) expect(image.rgba[i]).toBe(0xff);
    }
  });

  it('matches opposite floor edges and horizontal wall edges exactly', () => {
    for (const key of keys) {
      const image = environmentTileBitmap(key);
      for (let y = 0; y < image.h; y++) {
        const left = y * image.w * 4;
        const right = (y * image.w + image.w - 1) * 4;
        expect(image.rgba.slice(left, left + 4), `${key} horizontal seam at y=${y}`).toEqual(
          image.rgba.slice(right, right + 4)
        );
      }
      if (key === 'tile-wall-face') continue;
      for (let x = 0; x < image.w; x++) {
        const top = x * 4;
        const bottom = ((image.h - 1) * image.w + x) * 4;
        expect(image.rgba.slice(top, top + 4), `${key} vertical seam at x=${x}`).toEqual(
          image.rgba.slice(bottom, bottom + 4)
        );
      }
    }
  });

  it('keeps floor luminance subdued for actor readability', () => {
    for (let variant = 0; variant < 4; variant++) {
      const image = environmentTileBitmap(`tile-floor-${variant}` as EnvironmentTileKey);
      let luminance = 0;
      for (let i = 0; i < image.rgba.length; i += 4) {
        luminance += 0.2126 * image.rgba[i]! + 0.7152 * image.rgba[i + 1]! + 0.0722 * image.rgba[i + 2]!;
      }
      expect(luminance / (image.w * image.h)).toBeLessThan(40);
    }
  });
});

describe('the amber-resin environment tile pack (#28)', () => {
  const keys: readonly AmberResinTileKey[] = [
    'tile-amber-resin-wall',
    'tile-amber-resin-wall-inner',
    'tile-amber-resin-wall-face',
    'tile-amber-resin-floor-0',
    'tile-amber-resin-floor-1',
    'tile-amber-resin-floor-2',
    'tile-amber-resin-floor-3'
  ];

  it('matches the reviewable pixel source', () => {
    const pack = buildAmberResinTilePack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(readFileSync(file).equals(Buffer.from(png)), `${key}.png is stale — run \`npm run art:build\``).toBe(true);
    }
  });

  it('covers all four floors and three wall surfaces at contract sizes', () => {
    expect([...buildAmberResinTilePack().keys()]).toEqual(keys);
    for (const key of keys) {
      const image = amberResinTileBitmap(key);
      expect({ w: image.w, h: image.h }).toEqual(TEXTURE_SPECS[key]);
      for (let i = 3; i < image.rgba.length; i += 4) expect(image.rgba[i]).toBe(0xff);
    }
  });

  it('tiles without horizontal or vertical seams', () => {
    for (const key of keys) {
      const image = amberResinTileBitmap(key);
      for (let y = 0; y < image.h; y++) {
        const left = y * image.w * 4;
        const right = (y * image.w + image.w - 1) * 4;
        expect(image.rgba.slice(left, left + 4), `${key} horizontal seam at y=${y}`).toEqual(
          image.rgba.slice(right, right + 4)
        );
      }
      if (key === 'tile-amber-resin-wall-face') continue;
      for (let x = 0; x < image.w; x++) {
        const top = x * 4;
        const bottom = ((image.h - 1) * image.w + x) * 4;
        expect(image.rgba.slice(top, top + 4), `${key} vertical seam at x=${x}`).toEqual(
          image.rgba.slice(bottom, bottom + 4)
        );
      }
    }
  });

  it('keeps amber floors dark enough for actors to dominate', () => {
    for (let variant = 0; variant < 4; variant++) {
      const image = amberResinTileBitmap(`tile-amber-resin-floor-${variant}` as AmberResinTileKey);
      let luminance = 0;
      for (let i = 0; i < image.rgba.length; i += 4) {
        luminance += 0.2126 * image.rgba[i]! + 0.7152 * image.rgba[i + 1]! + 0.0722 * image.rgba[i + 2]!;
      }
      expect(luminance / (image.w * image.h)).toBeLessThan(45);
    }
  });

  it('is drawn as a distinct set rather than a recoloured Realm 1 export', () => {
    const colourPattern = (rgba: Uint8Array): number[] => {
      const colours = new Map<string, number>();
      const pattern: number[] = [];
      for (let i = 0; i < rgba.length; i += 4) {
        const colour = `${rgba[i]},${rgba[i + 1]},${rgba[i + 2]},${rgba[i + 3]}`;
        if (!colours.has(colour)) colours.set(colour, colours.size);
        pattern.push(colours.get(colour)!);
      }
      return pattern;
    };
    for (let variant = 0; variant < 4; variant++) {
      const realmOne = environmentTileBitmap(`tile-floor-${variant}` as EnvironmentTileKey);
      const amber = amberResinTileBitmap(`tile-amber-resin-floor-${variant}` as AmberResinTileKey);
      // Canonicalising each palette to first-seen indices makes a pure colour
      // substitution compare equal while preserving the underlying drawing.
      expect(colourPattern(amber.rgba)).not.toEqual(colourPattern(realmOne.rgba));
    }
  });
});

describe('the Hollow Throne environment tile pack (#110)', () => {
  const keys: readonly HollowThroneTileKey[] = [
    'tile-hollow-throne-wall',
    'tile-hollow-throne-wall-inner',
    'tile-hollow-throne-wall-face',
    'tile-hollow-throne-floor-0',
    'tile-hollow-throne-floor-1',
    'tile-hollow-throne-floor-2',
    'tile-hollow-throne-floor-3'
  ];

  it('matches the reviewable pixel source', () => {
    const pack = buildHollowThroneTilePack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(readFileSync(file).equals(Buffer.from(png)), `${key}.png is stale — run \`npm run art:build\``).toBe(true);
    }
  });

  it('covers four floors and three wall surfaces at contract sizes', () => {
    expect([...buildHollowThroneTilePack().keys()]).toEqual(keys);
    for (const key of keys) {
      const image = hollowThroneTileBitmap(key);
      expect({ w: image.w, h: image.h }).toEqual(TEXTURE_SPECS[key]);
      for (let i = 3; i < image.rgba.length; i += 4) expect(image.rgba[i]).toBe(0xff);
    }
  });

  it('tiles without horizontal or vertical seams', () => {
    for (const key of keys) {
      const image = hollowThroneTileBitmap(key);
      for (let y = 0; y < image.h; y++) {
        const left = y * image.w * 4;
        const right = (y * image.w + image.w - 1) * 4;
        expect(image.rgba.slice(left, left + 4), `${key} horizontal seam at y=${y}`).toEqual(
          image.rgba.slice(right, right + 4)
        );
      }
      if (key === 'tile-hollow-throne-wall-face') continue;
      for (let x = 0; x < image.w; x++) {
        const top = x * 4;
        const bottom = ((image.h - 1) * image.w + x) * 4;
        expect(image.rgba.slice(top, top + 4), `${key} vertical seam at x=${x}`).toEqual(
          image.rgba.slice(bottom, bottom + 4)
        );
      }
    }
  });

  it('keeps Hollow Throne floors dark enough for actors and telegraphs to dominate', () => {
    for (let variant = 0; variant < 4; variant++) {
      const image = hollowThroneTileBitmap(`tile-hollow-throne-floor-${variant}` as HollowThroneTileKey);
      let luminance = 0;
      for (let i = 0; i < image.rgba.length; i += 4) {
        luminance += 0.2126 * image.rgba[i]! + 0.7152 * image.rgba[i + 1]! + 0.0722 * image.rgba[i + 2]!;
      }
      expect(luminance / (image.w * image.h)).toBeLessThan(45);
    }
  });

  it('is structurally distinct from the Realm 1 floors, not a palette swap', () => {
    const colourPattern = (rgba: Uint8Array): number[] => {
      const colours = new Map<string, number>();
      const pattern: number[] = [];
      for (let i = 0; i < rgba.length; i += 4) {
        const colour = `${rgba[i]},${rgba[i + 1]},${rgba[i + 2]},${rgba[i + 3]}`;
        if (!colours.has(colour)) colours.set(colour, colours.size);
        pattern.push(colours.get(colour)!);
      }
      return pattern;
    };
    for (let variant = 0; variant < 4; variant++) {
      const realmOne = environmentTileBitmap(`tile-floor-${variant}` as EnvironmentTileKey);
      const throne = hollowThroneTileBitmap(`tile-hollow-throne-floor-${variant}` as HollowThroneTileKey);
      expect(colourPattern(throne.rgba)).not.toEqual(colourPattern(realmOne.rgba));
    }
  });
});

describe('the Hollow Throne decor pack (#110)', () => {
  const keys: readonly HollowThroneDecorKey[] = [
    'decor-throne-dais',
    'decor-throne-pillar',
    'decor-spent-casings',
    'decor-hanging-sacs'
  ];

  it('matches the reviewable pixel source', () => {
    const pack = buildHollowThroneDecorPack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(readFileSync(file).equals(Buffer.from(png)), `${key}.png is stale — run \`npm run art:build\``).toBe(true);
    }
  });

  it('uses exact contract sizes, visible pixels, and transparent corners', () => {
    expect([...buildHollowThroneDecorPack().keys()]).toEqual(keys);
    for (const key of keys) {
      const image = hollowThroneDecorBitmap(key);
      expect({ w: image.w, h: image.h }).toEqual(TEXTURE_SPECS[key]);
      expect(image.rgba.some((value, index) => index % 4 === 3 && value > 0), `${key} has no visible pixels`).toBe(true);
      for (const [x, y] of [
        [0, 0],
        [image.w - 1, 0],
        [0, image.h - 1],
        [image.w - 1, image.h - 1]
      ] as const) {
        expect(image.rgba[(y * image.w + x) * 4 + 3], `${key} needs transparent canvas corners`).toBe(0);
      }
    }
  });

  it('gives each motif a distinct silhouette and bitmap', () => {
    const masks = keys.map((key) => {
      const { rgba } = hollowThroneDecorBitmap(key);
      let mask = '';
      for (let i = 3; i < rgba.length; i += 4) mask += rgba[i]! > 0 ? '1' : '0';
      return mask;
    });
    const images = keys.map((key) => Buffer.from(buildHollowThroneDecorPack().get(key)!).toString('base64'));
    expect(new Set(masks)).toHaveLength(keys.length);
    expect(new Set(images)).toHaveLength(keys.length);
  });
});

describe('the Realm 1 world-object pack', () => {
  const keys: readonly WorldObjectKey[] = [
    'generator-brood-node-0',
    'generator-brood-node-1',
    'generator-brood-node-2',
    'generator-husk-mound-0',
    'generator-husk-mound-1',
    'generator-husk-mound-2',
    'generator-spitter-nest-0',
    'generator-spitter-nest-1',
    'generator-spitter-nest-2',
    'prop-resin-husk',
    'prop-amber-clutch',
    'decor-egg-cluster',
    'decor-resin-web',
    'decor-spore-patch'
  ];

  it('matches the reviewable pixel source', () => {
    const pack = buildWorldObjectPack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(readFileSync(file).equals(Buffer.from(png)), `${key}.png is stale — run \`npm run art:build\``).toBe(true);
    }
  });

  it('covers each node state, prop, and decor key at the art-contract size', () => {
    expect([...buildWorldObjectPack().keys()]).toEqual(keys);
    for (const key of keys) {
      const image = worldObjectBitmap(key);
      expect({ w: image.w, h: image.h }).toEqual(TEXTURE_SPECS[key]);
      expect(image.rgba.some((value, index) => index % 4 === 3 && value > 0), `${key} has no visible pixels`).toBe(true);
      for (const [x, y] of [
        [0, 0],
        [image.w - 1, 0],
        [0, image.h - 1],
        [image.w - 1, image.h - 1]
      ] as const) {
        expect(image.rgba[(y * image.w + x) * 4 + 3], `${key} needs transparent canvas corners`).toBe(0);
      }
    }
  });

  it('makes every object visually distinct', () => {
    const images = [...buildWorldObjectPack().values()].map((png) => Buffer.from(png).toString('base64'));
    expect(new Set(images)).toHaveLength(keys.length);
  });

  it('escalates exposed brood-light through the node damage states', () => {
    const lightPixels = ([0, 1, 2] as const).map((tier) => {
      const { rgba } = worldObjectBitmap(`generator-brood-node-${tier}`);
      let count = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        const hex = (rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!;
        if (hex === 0xe1a6f0 || hex === 0xfbe3ff || hex === 0xffffff) count++;
      }
      return count;
    });
    expect(lightPixels[1]).toBeGreaterThan(lightPixels[0]!);
    expect(lightPixels[2]).toBeGreaterThan(lightPixels[1]!);
  });
});

describe('the Realm 1 interaction-object pack', () => {
  const keys: readonly InteractionObjectKey[] = [
    'pickup-gold',
    'pickup-health',
    'pickup-frenzy',
    'pickup-swiftness',
    'pickup-ward',
    'pickup-key',
    'pickup-potion',
    'level-gate',
    'exit-portal'
  ];
  const pickupKeys = keys.slice(0, 7);

  it('matches the reviewable pixel source', () => {
    const pack = buildInteractionObjectPack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(readFileSync(file).equals(Buffer.from(png)), `${key}.png is stale — run \`npm run art:build\``).toBe(true);
    }
  });

  it('covers every pickup plus the gate and portal at the art-contract size', () => {
    expect([...buildInteractionObjectPack().keys()]).toEqual(keys);
    for (const key of keys) {
      const image = interactionObjectBitmap(key);
      expect({ w: image.w, h: image.h }).toEqual(TEXTURE_SPECS[key]);
      expect(image.rgba.some((value, index) => index % 4 === 3 && value > 0), `${key} has no visible pixels`).toBe(true);
      for (const [x, y] of [
        [0, 0],
        [image.w - 1, 0],
        [0, image.h - 1],
        [image.w - 1, image.h - 1]
      ] as const) {
        expect(image.rgba[(y * image.w + x) * 4 + 3], `${key} needs transparent canvas corners`).toBe(0);
      }
    }
  });

  it('gives every pickup a distinct alpha silhouette, not merely a different colour', () => {
    const masks = pickupKeys.map((key) => {
      const { rgba } = interactionObjectBitmap(key);
      let mask = '';
      for (let i = 3; i < rgba.length; i += 4) mask += rgba[i]! > 0 ? '1' : '0';
      return mask;
    });
    expect(new Set(masks)).toHaveLength(pickupKeys.length);
  });

  it('keeps the exit portal half-turn symmetric with an open centre', () => {
    const image = interactionObjectBitmap('exit-portal');
    for (let y = 0; y < image.h; y++) {
      for (let x = 0; x < image.w; x++) {
        const i = (y * image.w + x) * 4;
        const opposite = ((image.h - 1 - y) * image.w + (image.w - 1 - x)) * 4;
        expect(image.rgba.slice(i, i + 4)).toEqual(image.rgba.slice(opposite, opposite + 4));
      }
    }
    for (const [x, y] of [
      [23, 23],
      [24, 23],
      [23, 24],
      [24, 24]
    ] as const) {
      expect(image.rgba[(y * image.w + x) * 4 + 3]).toBe(0);
    }
  });

  it('makes the gate read solid and the portal read as a ring', () => {
    const coverage = (key: InteractionObjectKey): number => {
      const image = interactionObjectBitmap(key);
      let visible = 0;
      for (let i = 3; i < image.rgba.length; i += 4) if (image.rgba[i]! > 0) visible++;
      return visible / (image.w * image.h);
    };
    expect(coverage('level-gate')).toBeGreaterThan(0.75);
    expect(coverage('exit-portal')).toBeLessThan(0.35);
  });
});

describe('the HUD and title UI pack', () => {
  const keys: readonly UiArtKey[] = [
    'ui-icon-gold',
    'ui-icon-kills',
    'ui-icon-key',
    'ui-icon-potion',
    'ui-power-frenzy',
    'ui-power-swiftness',
    'ui-power-ward',
    'ui-ability-ready',
    'ui-title-logo-base',
    'ui-title-logo-glow'
  ];

  it('matches the reviewable pixel source', () => {
    const pack = buildUiArtPack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(readFileSync(file).equals(Buffer.from(png)), `${key}.png is stale — run \`npm run art:build\``).toBe(true);
    }
  });

  it('covers every UI slot at its art-contract size with transparent corners', () => {
    expect([...buildUiArtPack().keys()]).toEqual(keys);
    for (const key of keys) {
      const image = uiArtBitmap(key);
      expect({ w: image.w, h: image.h }).toEqual(TEXTURE_SPECS[key]);
      expect(image.rgba.some((value, index) => index % 4 === 3 && value > 0), `${key} has no visible pixels`).toBe(true);
      for (const [x, y] of [
        [0, 0],
        [image.w - 1, 0],
        [0, image.h - 1],
        [image.w - 1, image.h - 1]
      ] as const) {
        expect(image.rgba[(y * image.w + x) * 4 + 3], `${key} needs transparent canvas corners`).toBe(0);
      }
    }
  });

  it('gives each compact HUD glyph and chip a distinct silhouette', () => {
    const compact = keys.slice(0, 7);
    const masks = compact.map((key) => {
      const { rgba } = uiArtBitmap(key);
      let mask = '';
      for (let i = 3; i < rgba.length; i += 4) mask += rgba[i]! > 0 ? '1' : '0';
      return mask;
    });
    expect(new Set(masks)).toHaveLength(compact.length);
  });

  it('keeps the ability flare tintable and the title glow translucent', () => {
    const flare = uiArtBitmap('ui-ability-ready');
    for (let i = 0; i < flare.rgba.length; i += 4) {
      if (flare.rgba[i + 3] === 0) continue;
      expect(Array.from(flare.rgba.slice(i, i + 3))).toEqual([255, 255, 255]);
    }

    const glow = uiArtBitmap('ui-title-logo-glow');
    const visibleAlpha = [...glow.rgba].filter((_, index) => index % 4 === 3 && glow.rgba[index]! > 0);
    expect(visibleAlpha.length).toBeGreaterThan(100);
    expect(Math.max(...visibleAlpha)).toBeLessThan(0xff);
  });
});

describe('the Ranger pack', () => {
  it('matches the pixel grids it is drawn from', () => {
    const pack = buildRangerPack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        // Append rather than rebuild: the packs that landed before this one
        // own their order, and churning it would bury the real diff.
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(
        readFileSync(file).equals(Buffer.from(png)),
        `${key}.png is stale — run \`npm run art:build\``
      ).toBe(true);
    }
  });

  it('covers all eight facings, both walk frames, the draw, and the portrait', () => {
    const keys = [...buildRangerPack().keys()];
    expect(keys).toHaveLength(25);
    for (let dir = 0; dir < 8; dir++) {
      for (const pose of ['w0', 'w1', 'atk']) expect(keys).toContain(`hero-ranger-${dir}-${pose}`);
    }
    expect(keys).toContain('hero-ranger');
  });
});

describe('the Sentinel pack', () => {
  it('matches the pixel grids it is drawn from', () => {
    const pack = buildSentinelPack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(
        readFileSync(file).equals(Buffer.from(png)),
        `${key}.png is stale — run \`npm run art:build\``
      ).toBe(true);
    }
  });

  it('covers all eight facings, both walk frames, the sweep, and the portrait', () => {
    const keys = [...buildSentinelPack().keys()];
    expect(keys).toHaveLength(25);
    for (let dir = 0; dir < 8; dir++) {
      for (const pose of ['w0', 'w1', 'atk']) expect(keys).toContain(`hero-sentinel-${dir}-${pose}`);
    }
    expect(keys).toContain('hero-sentinel');
  });
});

describe('the Skitter pack', () => {
  it('matches the pixel grids it is drawn from', () => {
    const pack = buildSkitterPack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(
        readFileSync(file).equals(Buffer.from(png)),
        `${key}.png is stale — run \`npm run art:build\``
      ).toBe(true);
    }
  });

  it('covers every tier and crawl / nip pose', () => {
    const keys = [...buildSkitterPack().keys()];
    expect(keys).toHaveLength(9);
    for (const tier of ['common', 'veteran', 'elite']) {
      for (const frame of ['w0', 'w1', 'windup']) {
        expect(keys).toContain(`enemy-skitter-${tier}-${frame}`);
      }
    }
  });

  it('keeps both crawl frames and the telegraphed nip visually distinct', () => {
    const pack = buildSkitterPack();
    for (const tier of ['common', 'veteran', 'elite']) {
      const w0 = Buffer.from(pack.get(`enemy-skitter-${tier}-w0`)!);
      const w1 = Buffer.from(pack.get(`enemy-skitter-${tier}-w1`)!);
      const windup = Buffer.from(pack.get(`enemy-skitter-${tier}-windup`)!);
      expect(w0.equals(w1)).toBe(false);
      expect(w0.equals(windup)).toBe(false);
      expect(w1.equals(windup)).toBe(false);
    }
  });
});

describe('the Husk pack', () => {
  it('matches the pixel grids it is drawn from', () => {
    const pack = buildHuskPack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(readFileSync(file).equals(Buffer.from(png)), `${key}.png is stale — run \`npm run art:build\``).toBe(true);
    }
  });

  it('covers every tier and lumber / overhead pose', () => {
    const keys = [...buildHuskPack().keys()];
    expect(keys).toHaveLength(9);
    for (const tier of ['common', 'veteran', 'elite']) {
      for (const frame of ['w0', 'w1', 'windup']) expect(keys).toContain(`enemy-husk-${tier}-${frame}`);
    }
  });

  it('keeps both lumber frames and the raised-arm windup distinct', () => {
    const pack = buildHuskPack();
    for (const tier of ['common', 'veteran', 'elite']) {
      const w0 = Buffer.from(pack.get(`enemy-husk-${tier}-w0`)!);
      const w1 = Buffer.from(pack.get(`enemy-husk-${tier}-w1`)!);
      const windup = Buffer.from(pack.get(`enemy-husk-${tier}-windup`)!);
      expect(w0.equals(w1)).toBe(false);
      expect(w0.equals(windup)).toBe(false);
      expect(w1.equals(windup)).toBe(false);
    }
  });
});

describe('the Spitter pack', () => {
  it('matches the pixel grids it is drawn from', () => {
    const pack = buildSpitterPack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(readFileSync(file).equals(Buffer.from(png)), `${key}.png is stale — run \`npm run art:build\``).toBe(true);
    }
  });

  it('covers every tier and walk / swollen-sac pose', () => {
    const keys = [...buildSpitterPack().keys()];
    expect(keys).toHaveLength(9);
    for (const tier of ['common', 'veteran', 'elite']) {
      for (const frame of ['w0', 'w1', 'windup']) expect(keys).toContain(`enemy-spitter-${tier}-${frame}`);
    }
  });

  it('keeps both walk frames and the charged spread windup distinct', () => {
    const pack = buildSpitterPack();
    for (const tier of ['common', 'veteran', 'elite']) {
      const w0 = Buffer.from(pack.get(`enemy-spitter-${tier}-w0`)!);
      const w1 = Buffer.from(pack.get(`enemy-spitter-${tier}-w1`)!);
      const windup = Buffer.from(pack.get(`enemy-spitter-${tier}-windup`)!);
      expect(w0.equals(w1)).toBe(false);
      expect(w0.equals(windup)).toBe(false);
      expect(w1.equals(windup)).toBe(false);
    }
  });
});

describe('the Mireveil pack', () => {
  it('matches the pixel grids it is drawn from', () => {
    const pack = buildMireveilPack();

    if (process.env.UPDATE_ART) {
      const listed = manifestKeys();
      for (const [key, png] of pack) {
        writeFileSync(`${ART_DIR}${key}.png`, png);
        if (!listed.includes(key)) listed.push(key);
      }
      writeFileSync(MANIFEST, `${JSON.stringify(listed, null, 2)}\n`);
      return;
    }

    for (const [key, png] of pack) {
      const file = `${ART_DIR}${key}.png`;
      expect(existsSync(file), `${key}.png is missing — run \`npm run art:build\``).toBe(true);
      expect(readFileSync(file).equals(Buffer.from(png)), `${key}.png is stale — run \`npm run art:build\``).toBe(true);
    }
  });

  it('covers intact, wounded, and critical damage states', () => {
    expect([...buildMireveilPack().keys()]).toEqual(['boss-mireveil-0', 'boss-mireveil-1', 'boss-mireveil-2']);
  });

  it('keeps one silhouette while exposed brood-light escalates', () => {
    const grids = ([0, 1, 2] as const).map(mireveilGrid);
    const masks = grids.map((rows) => rows.map((row) => [...row].map((pixel) => pixel !== '.').join('')).join('\n'));
    expect(new Set(masks)).toHaveLength(1);

    const exposedLight = grids.map((rows) => rows.join('').match(/[LW]/g)?.length ?? 0);
    expect(exposedLight[1]).toBeGreaterThan(exposedLight[0]!);
    expect(exposedLight[2]).toBeGreaterThan(exposedLight[1]!);
    expect(new Set([...buildMireveilPack().values()].map((png) => Buffer.from(png).toString('base64')))).toHaveLength(3);
  });
});
