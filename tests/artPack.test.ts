import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildRangerPack } from '../scripts/art/rangerPack';
import { buildSentinelPack } from '../scripts/art/sentinelPack';
import { buildSkitterPack } from '../scripts/art/skitterPack';
import { buildHuskPack } from '../scripts/art/huskPack';
import { TEXTURE_SPECS } from '../src/game/textureSpecs';

/**
 * Guards the drop-in art contract in `docs/ART.md` from the one side the
 * runtime cannot: `BootScene` rejects a wrong-sized override at boot with a
 * console warning and silently falls back to generated art, and a manifest key
 * with no file behind it is only a browser 404. Neither fails a build, so a
 * broken pack would ship looking merely "not as nice as the mockup".
 *
 * Here the same rules are structural. It also keeps the checked-in Ranger PNGs
 * honest against the pixel grids they were drawn as — regenerate with
 * `npm run art:build`.
 */
const ART_DIR = fileURLToPath(new URL('../public/art/', import.meta.url));
const MANIFEST = `${ART_DIR}manifest.json`;

function manifestKeys(): string[] {
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as string[];
}

/** Width and height straight out of the PNG's IHDR chunk. */
function pngSize(file: string): { w: number; h: number } {
  const buf = readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
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
