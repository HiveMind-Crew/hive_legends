import Phaser from 'phaser';
import { ENEMY_FAMILIES, ENEMY_TIERS, type EnemyFamily, type EnemyTier } from '../sim/types';
import { TEXTURE_SPECS } from './textureSpecs';

/**
 * Generated programmer-art textures and sprite frames. Everything is drawn
 * once at boot so the game ships with zero binary assets; real art replaces
 * these texture keys later without touching game code.
 *
 * Characters are small frame sets rather than single images: the hero has
 * 8 facing directions x (2 walk frames + attack pose), the skitterling has
 * a two-frame crawl wiggle plus a windup telegraph pose. The scene picks
 * frames from sim state; nothing here is animated by itself.
 */

export const TEX = {
  wall: 'tile-wall',
  wallInner: 'tile-wall-inner',
  wallFace: 'tile-wall-face',
  floor: 'tile-floor-0',
  decorEgg: 'decor-egg-cluster',
  decorWeb: 'decor-resin-web',
  decorSpore: 'decor-spore-patch',
  glow: 'fx-glow',
  mote: 'fx-mote',
  bolt: 'fx-bolt',
  hero: 'hero-vanguard', // portrait alias (south-facing idle frame)
  gold: 'pickup-gold',
  health: 'pickup-health',
  key: 'pickup-key',
  potion: 'pickup-potion',
  gate: 'level-gate',
  exit: 'exit-portal',
  uiGold: 'ui-icon-gold',
  uiKills: 'ui-icon-kills',
  uiKey: 'ui-icon-key',
  uiPotion: 'ui-icon-potion',
  uiPowerFrenzy: 'ui-power-frenzy',
  uiPowerSwiftness: 'ui-power-swiftness',
  uiPowerWard: 'ui-power-ward',
  uiAbilityReady: 'ui-ability-ready',
  titleLogoBase: 'ui-title-logo-base',
  titleLogoGlow: 'ui-title-logo-glow',
  shadow: 'fx-shadow',
  accentRing: 'fx-accent-ring',
  chevron: 'fx-chevron',
  ichor: 'fx-ichor',
  shard: 'fx-shard',
  spark: 'fx-spark',
  dust: 'fx-dust',
  heart: 'fx-heart'
} as const;

export type HeroPose = 'w0' | 'w1' | 'atk';
export type EnemyAnimFrame = 'w0' | 'w1' | 'windup';

export function heroFrame(heroId: string, dir: number, pose: HeroPose): string {
  return `hero-${heroId}-${dir}-${pose}`;
}

export function heroPortrait(heroId: string): string {
  return `hero-${heroId}`;
}

/** Per-hero look for the shared frame layout (accent-neutral; see ART.md). */
interface HeroStyle {
  body: number;
  inner: number;
  trim: number;
  crest: number;
  feet: number;
  outline: number;
  weapon: 'blade' | 'staff' | 'bow' | 'maul';
  weaponColor: number;
}

const HERO_STYLES: Record<string, HeroStyle> = {
  vanguard: {
    body: 0x5a8fd9,
    inner: 0x2f5a8c,
    trim: 0x87b1e8,
    crest: 0xd9e6f4,
    feet: 0x1c2c44,
    outline: 0x14243d,
    weapon: 'blade',
    weaponColor: 0xd9e6f4
  },
  arcanist: {
    body: 0x8a5fc9,
    inner: 0x5a3a8c,
    trim: 0xb69ae0,
    crest: 0xf0e6a0,
    feet: 0x2a1c44,
    outline: 0x2a1440,
    weapon: 'staff',
    weaponColor: 0xffd75e
  },
  ranger: {
    body: 0x5aa16a,
    inner: 0x2f6a44,
    trim: 0x86c98f,
    crest: 0xe0d59a,
    feet: 0x1f3524,
    outline: 0x173a26,
    weapon: 'bow',
    weaponColor: 0xcaa66a
  },
  sentinel: {
    body: 0x8f96a3,
    inner: 0x5b6270,
    trim: 0xc2c8d2,
    crest: 0xe6b45a,
    feet: 0x2b2f38,
    outline: 0x2a2e36,
    weapon: 'maul',
    weaponColor: 0xb9c0cc
  }
};

const DEFAULT_HERO_STYLE = HERO_STYLES['vanguard']!;

/** Composed enemy frames: silhouette family x palette tier x animation frame. */
export function enemyFrame(family: EnemyFamily, tier: EnemyTier, frame: EnemyAnimFrame): string {
  return `enemy-${family}-${tier}-${frame}`;
}

/**
 * Tier palettes: common pale spore-green, veteran amber, elite crimson with
 * a glow outline (elites also get a renderer-side size bump + ground ring).
 */
interface TierPalette {
  body: number;
  dark: number;
  bright: number; // windup body flush
  brightDark: number;
  eye: number;
  windupEye: number;
  glow?: number;
}

const TIER_PALETTES: Record<EnemyTier, TierPalette> = {
  common: {
    body: 0x9fe06a,
    dark: 0x5b8f33,
    bright: 0xc8f09a,
    brightDark: 0x86b356,
    eye: 0x1c260f,
    windupEye: 0xff5a4d
  },
  veteran: {
    body: 0xf0c25e,
    dark: 0xa8813a,
    bright: 0xf7db9a,
    brightDark: 0xc4a05e,
    eye: 0x2a1f0a,
    windupEye: 0xff5a4d
  },
  elite: {
    body: 0xe0524d,
    dark: 0x8f2f30,
    bright: 0xf08a86,
    brightDark: 0xb35450,
    eye: 0x260b0b,
    windupEye: 0xffe36e,
    glow: 0xff8a7a
  }
};

/** Generator family plus damage tier: 0 intact, 1 damaged, 2 crumbling. */
export function generatorFrame(typeId: string, tier: number): string {
  return `generator-${typeId}-${tier}`;
}

export const FLOOR_VARIANTS = 4;
export function floorVariant(i: number, tileSet?: string): string {
  return tileSet ? `tile-${tileSet}-floor-${i}` : `tile-floor-${i}`;
}

export function wallTexture(surface: 'top' | 'inner' | 'face', tileSet?: string): string {
  if (!tileSet) {
    if (surface === 'inner') return TEX.wallInner;
    if (surface === 'face') return TEX.wallFace;
    return TEX.wall;
  }
  const suffix = surface === 'top' ? 'wall' : `wall-${surface}`;
  return `tile-${tileSet}-${suffix}`;
}

export function propTexture(typeId: string): string {
  return `prop-${typeId}`;
}

/** Pickup sprite key for a power-up buff. */
/** Boss damage-tier frame: 0 intact, 1 cracked, 2 crumbling (issue #25). */
export function bossFrame(bossId: string, tier: number): string {
  return `boss-${bossId}-${tier}`;
}

export function powerupTexture(power: string): string {
  return `pickup-${power}`;
}

/** Aura tint for an active power-up buff (pickup, player glow, HUD). */
export const POWERUP_COLORS: Record<string, number> = {
  frenzy: 0xff8a3d,
  swiftness: 0x5ad6ff,
  ward: 0x7be08a
};

/** Maps a facing vector to one of 8 direction indices (0 = east, clockwise). */
export function facingDirIndex(x: number, y: number): number {
  const idx = Math.round(Math.atan2(y, x) / (Math.PI / 4));
  return ((idx % 8) + 8) % 8;
}

/**
 * Bound for the duration of a generation pass. Draw helpers finish each
 * texture through this so canvas sizes come from TEXTURE_SPECS (the single
 * source of truth) and keys already loaded as drop-in art overrides
 * (public/art/<key>.png, see BootScene and docs/ART.md) are left untouched.
 */
let gen: (key: string) => void = () => {
  throw new Error('gen used outside generateTextures');
};

export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  gen = (key: string): void => {
    const spec = TEXTURE_SPECS[key];
    if (!spec) throw new Error(`no texture spec for key: ${key}`);
    if (!scene.textures.exists(key)) g.generateTexture(key, spec.w, spec.h);
  };

  // Wall top face: chitin roof slab, read from above.
  g.clear();
  g.fillStyle(0x352943);
  g.fillRect(0, 0, 32, 32);
  g.fillStyle(0x453456);
  g.fillRect(0, 0, 32, 3);
  g.fillStyle(0x2b2036);
  g.fillRect(5, 9, 8, 6);
  g.fillRect(19, 18, 9, 7);
  g.lineStyle(1, 0x120c1a);
  g.strokeRect(0, 0, 32, 32);
  gen(TEX.wall);

  // Wall front face: darker vertical slab under south-facing wall edges,
  // giving walls visible height (32x16, overlaps the floor tile below).
  g.clear();
  g.fillStyle(0x201830);
  g.fillRect(0, 0, 32, 16);
  g.fillStyle(0x2b2036);
  g.fillRect(4, 3, 3, 11);
  g.fillRect(14, 2, 3, 12);
  g.fillRect(24, 4, 3, 10);
  g.fillStyle(0x453456);
  g.fillRect(0, 0, 32, 2);
  g.fillStyle(0x0d0912, 0.9);
  g.fillRect(0, 14, 32, 2);
  gen(TEX.wallFace);

  // Inner wall (surrounded by walls on all sides): flat, dark, undetailed.
  g.clear();
  g.fillStyle(0x2b2036);
  g.fillRect(0, 0, 32, 32);
  g.fillStyle(0x241b2e);
  g.fillRect(6, 8, 9, 7);
  g.fillRect(19, 20, 8, 6);
  gen(TEX.wallInner);

  // Floor variants: base mottle, cracks, hive-membrane patch, bone scatter.
  // A tile-coordinate hash picks the variant, so dressing is deterministic.
  for (let v = 0; v < FLOOR_VARIANTS; v++) {
    g.clear();
    g.fillStyle(0x17131f);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x1d1827);
    g.fillRect(2, 2, 6, 6);
    g.fillRect(20, 12, 7, 7);
    g.fillRect(8, 22, 5, 5);
    if (v === 1) {
      g.lineStyle(1, 0x100c16);
      g.lineBetween(6, 6, 15, 14);
      g.lineBetween(15, 14, 11, 24);
      g.lineBetween(22, 4, 26, 12);
    } else if (v === 2) {
      g.fillStyle(0x241a30, 0.9);
      g.fillEllipse(20, 20, 16, 12);
      g.fillStyle(0x2e2140, 0.8);
      g.fillEllipse(18, 19, 8, 6);
    } else if (v === 3) {
      g.fillStyle(0x4a4452);
      g.fillRect(7, 9, 5, 2);
      g.fillRect(21, 22, 4, 2);
      g.fillRect(14, 17, 2, 4);
      g.fillStyle(0x5d5766);
      g.fillCircle(24, 7, 1.5);
    }
    gen(floorVariant(v));
  }

  // Amber-resin fallback set for The Resin Galleries. The checked-in original
  // pack overrides these keys; fallbacks keep partial manifests playable.
  g.clear();
  g.fillStyle(0x3d2813);
  g.fillRect(0, 0, 32, 32);
  g.lineStyle(2, 0x7a521f);
  g.strokeEllipse(8, 7, 18, 12);
  g.strokeEllipse(23, 20, 20, 15);
  g.fillStyle(0xc4852d);
  g.fillCircle(6, 4, 1.5);
  g.fillCircle(23, 13, 1.5);
  gen(wallTexture('top', 'amber-resin'));

  g.clear();
  g.fillStyle(0x24170d);
  g.fillRect(0, 0, 32, 32);
  g.lineStyle(1, 0x5b3a18);
  g.strokeEllipse(8, 8, 20, 14);
  g.strokeEllipse(25, 23, 24, 18);
  gen(wallTexture('inner', 'amber-resin'));

  g.clear();
  g.fillStyle(0x24170d);
  g.fillRect(0, 0, 32, 16);
  g.fillStyle(0x7a521f);
  g.fillRect(0, 0, 32, 2);
  for (const x of [2, 9, 17, 25]) {
    g.fillStyle(0x3d2813);
    g.fillRect(x, 2, 5, 12);
    g.fillStyle(0x5b3a18);
    g.fillRect(x + 1, 3, 1, 9);
  }
  g.fillStyle(0x120e0b);
  g.fillRect(0, 14, 32, 2);
  gen(wallTexture('face', 'amber-resin'));

  for (let v = 0; v < FLOOR_VARIANTS; v++) {
    g.clear();
    g.fillStyle(0x1b1510);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x2a2117);
    g.fillEllipse(8, 7, 10 + v * 2, 7 + v);
    g.fillEllipse(24, 22, 13 - v, 9);
    if (v === 1) {
      g.lineStyle(1, 0x9a651d);
      g.lineBetween(0, 8, 13, 16);
      g.lineBetween(13, 16, 20, 31);
    } else if (v === 2) {
      g.lineStyle(1, 0x5c3d16);
      g.strokeEllipse(16, 15, 21, 15);
    } else if (v === 3) {
      g.fillStyle(0x7a521f);
      g.fillTriangle(6, 8, 11, 5, 10, 12);
      g.fillTriangle(23, 20, 28, 24, 21, 26);
    }
    gen(floorVariant(v, 'amber-resin'));
  }

  // Hero frame sets: every roster hero x 8 directions x (walk0, walk1,
  // attack), plus a south-facing portrait alias for menus.
  for (const heroId of Object.keys(HERO_STYLES)) {
    const style = HERO_STYLES[heroId] ?? DEFAULT_HERO_STYLE;
    for (let dir = 0; dir < 8; dir++) {
      drawHeroFrame(g, style, dir, 'w0', heroFrame(heroId, dir, 'w0'));
      drawHeroFrame(g, style, dir, 'w1', heroFrame(heroId, dir, 'w1'));
      drawHeroFrame(g, style, dir, 'atk', heroFrame(heroId, dir, 'atk'));
    }
    drawHeroFrame(g, style, 2, 'w0', heroPortrait(heroId));
  }

  // Enemy frame sets: every silhouette family x palette tier x anim frame
  // (drawn facing +x; the scene rotates the sprite).
  for (const family of ENEMY_FAMILIES) {
    for (const tier of ENEMY_TIERS) {
      for (const frame of ['w0', 'w1', 'windup'] as const) {
        drawEnemyFrame(g, family, tier, frame);
      }
    }
  }

  // Generator families each carry three damage tiers.
  for (const tier of [0, 1, 2] as const) {
    drawBroodNode(g, tier);
    drawHuskMound(g, tier);
    drawSpitterNest(g, tier);
  }

  // Mireveil, Mother of the Brood (issue #25) — same damage-tier language,
  // scaled up to a finale silhouette.
  drawMireveil(g, 0);
  drawMireveil(g, 1);
  drawMireveil(g, 2);

  // Gold coin.
  g.clear();
  g.fillStyle(0xffd75e);
  g.fillCircle(8, 8, 7);
  g.fillStyle(0xb8922e);
  g.fillCircle(8, 8, 4);
  gen(TEX.gold);

  // Health: hearty red morsel.
  g.clear();
  g.fillStyle(0xe0524d);
  g.fillCircle(6, 9, 5);
  g.fillCircle(12, 9, 5);
  g.fillTriangle(2, 11, 16, 11, 9, 17);
  gen(TEX.health);

  // Power-up relics (issue #16): a gem in a colored aura per buff. Frenzy
  // burns orange, Swiftness streaks cyan, Ward glows a protective green.
  drawRelic(g, 'pickup-frenzy', 0xff8a3d, 0xffd08a, 'spike');
  drawRelic(g, 'pickup-swiftness', 0x5ad6ff, 0xc8f2ff, 'chevron');
  drawRelic(g, 'pickup-ward', 0x7be08a, 0xd6ffd0, 'shield');

  // Key pickup (issue #17): a small brass key.
  g.clear();
  g.fillStyle(0xe6c34a);
  g.fillCircle(6, 7, 4); // bow
  g.fillStyle(0x141018);
  g.fillCircle(6, 7, 1.6); // hole
  g.fillStyle(0xe6c34a);
  g.fillRect(9, 6, 7, 2.4); // shaft
  g.fillRect(13, 8, 2, 3); // teeth
  g.fillRect(15, 8, 2, 2); // teeth
  gen(TEX.key);

  // Potion (issue #41): a round-bottomed flask of glowing hive-fire, corked.
  g.clear();
  g.fillStyle(0x2a5b3a); // dark glass base
  g.fillCircle(9, 12, 6); // bulb
  g.fillRect(6, 4, 6, 6); // neck
  g.fillStyle(0x7be08a); // luminous draught
  g.fillCircle(9, 12, 4);
  g.fillStyle(0xd6ffd0); // highlight glint
  g.fillCircle(7, 10, 1.4);
  g.fillStyle(0x8a5a2e); // cork
  g.fillRect(6, 2, 6, 3);
  gen(TEX.potion);

  // Key-locked gate (issue #17): heavy barred door filling a tile.
  g.clear();
  g.fillStyle(0x3a2f22);
  g.fillRect(2, 1, 28, 30); // frame backing
  g.fillStyle(0x6a5636);
  for (let bx = 4; bx <= 26; bx += 6) g.fillRect(bx, 3, 3, 26); // vertical bars
  g.fillStyle(0x8a7048);
  g.fillRect(3, 6, 26, 3);
  g.fillRect(3, 22, 26, 3); // cross braces
  g.fillStyle(0xe6c34a);
  g.fillCircle(16, 16, 3); // lock plate
  g.lineStyle(2, 0x241b12);
  g.strokeRect(2, 1, 28, 30);
  gen(TEX.gate);

  // Exit portal: glowing ring.
  g.clear();
  g.lineStyle(4, 0x64e6ff);
  g.strokeCircle(24, 24, 18);
  g.lineStyle(2, 0xbdf4ff);
  g.strokeCircle(24, 24, 11);
  gen(TEX.exit);

  // Compact HUD fallbacks. The original pack in public/art overrides these;
  // these simple shapes keep a partial manifest playable.
  g.clear();
  g.fillStyle(0xffd75e);
  g.fillCircle(6, 6, 5);
  g.fillStyle(0x8f661c);
  g.fillCircle(6, 6, 2);
  gen(TEX.uiGold);

  g.clear();
  g.fillStyle(0xcfc4de);
  g.fillTriangle(2, 3, 10, 3, 6, 11);
  g.fillStyle(0x6b5878);
  g.fillCircle(6, 5, 2);
  gen(TEX.uiKills);

  g.clear();
  g.lineStyle(3, 0xffd75e);
  g.strokeCircle(4, 4, 3);
  g.lineBetween(6, 6, 11, 11);
  gen(TEX.uiKey);

  g.clear();
  g.fillStyle(0x7be08a);
  g.fillCircle(6, 8, 4);
  g.fillStyle(0x8a5a2e);
  g.fillRect(4, 1, 4, 3);
  gen(TEX.uiPotion);

  drawRelic(g, TEX.uiPowerFrenzy, 0xff8a3d, 0xffd08a, 'spike');
  drawRelic(g, TEX.uiPowerSwiftness, 0x5ad6ff, 0xc8f2ff, 'chevron');
  drawRelic(g, TEX.uiPowerWard, 0x7be08a, 0xd6ffd0, 'shield');

  g.clear();
  g.lineStyle(2, 0xffffff, 0.9);
  g.strokeRoundedRect(4, 4, 68, 10, 4);
  g.lineBetween(0, 9, 7, 9);
  g.lineBetween(69, 9, 76, 9);
  gen(TEX.uiAbilityReady);

  g.clear();
  g.fillStyle(0x4a3210);
  g.fillRoundedRect(24, 18, 336, 60, 18);
  g.lineStyle(4, 0xffd75e);
  g.strokeRoundedRect(28, 22, 328, 52, 16);
  gen(TEX.titleLogoBase);

  g.clear();
  g.lineStyle(10, 0xffffff, 0.25);
  g.strokeRoundedRect(22, 16, 340, 64, 20);
  gen(TEX.titleLogoGlow);

  // Elliptical drop shadow (alpha baked in; scaled per entity).
  g.clear();
  g.fillStyle(0x000000, 0.4);
  g.fillEllipse(16, 7, 28, 10);
  gen(TEX.shadow);

  // Player accent underglow ring (white; tinted per player, squashed to ground).
  g.clear();
  g.lineStyle(3, 0xffffff);
  g.strokeCircle(20, 20, 15);
  gen(TEX.accentRing);

  // Set dressing (issue #5): egg clusters, resin webbing, glowing spore patches.
  g.clear();
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(12, 16, 20, 7);
  g.fillStyle(0x7a3b8f);
  g.fillCircle(8, 12, 5);
  g.fillCircle(16, 13, 4.5);
  g.fillCircle(12, 8, 4);
  g.fillStyle(0xa855c8);
  g.fillCircle(7, 10.5, 2);
  g.fillCircle(15, 11.5, 1.8);
  g.fillCircle(11, 6.5, 1.6);
  gen(TEX.decorEgg);

  g.clear();
  g.lineStyle(1, 0xcfc4de, 0.4);
  for (let i = 0; i < 5; i++) {
    g.lineBetween(2, 3 + i * 5, 26, 1 + i * 6);
    g.lineBetween(3 + i * 5, 2, 1 + i * 6, 26);
  }
  g.lineStyle(1, 0xffffff, 0.25);
  g.strokeCircle(14, 14, 8);
  g.strokeCircle(14, 14, 4);
  gen(TEX.decorWeb);

  g.clear();
  g.fillStyle(0x2c4020, 0.9);
  g.fillEllipse(12, 9, 20, 12);
  g.fillStyle(0x9fe06a, 0.9);
  g.fillCircle(8, 8, 2.5);
  g.fillCircle(15, 11, 2);
  g.fillCircle(13, 6, 1.6);
  g.fillStyle(0xd6f7b0);
  g.fillCircle(8, 8, 1);
  g.fillCircle(15, 11, 0.8);
  gen(TEX.decorSpore);

  // Radial glow (white, tinted per light source, additive blend).
  g.clear();
  for (let r = 24; r >= 4; r -= 4) {
    g.fillStyle(0xffffff, 0.05 + (0.16 * (24 - r)) / 20);
    g.fillCircle(24, 24, r);
  }
  gen(TEX.glow);

  // Drifting portal mote.
  g.clear();
  g.fillStyle(0xffffff);
  g.fillCircle(2, 2, 2);
  gen(TEX.mote);

  // Projectile bolt: bright capsule pointing +x (tinted per hero, rotated).
  g.clear();
  g.fillStyle(0xffffff, 0.55);
  g.fillEllipse(6, 3, 12, 6);
  g.fillStyle(0xffffff);
  g.fillEllipse(7, 3, 8, 4);
  gen(TEX.bolt);

  // Breakable props: resin husk (gold) and amber clutch (health).
  g.clear();
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(10, 16, 16, 6);
  g.fillStyle(0x8f7a4a);
  g.fillCircle(10, 10, 7);
  g.fillStyle(0xbfa15e);
  g.fillCircle(10, 8, 4.5);
  g.lineStyle(1, 0x4a3d22);
  g.strokeCircle(10, 10, 7);
  g.lineBetween(6, 7, 12, 13);
  gen(propTexture('resin-husk'));

  g.clear();
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(10, 16, 16, 6);
  g.fillStyle(0xb3543f);
  g.fillCircle(7, 11, 4.5);
  g.fillCircle(13, 11, 4.5);
  g.fillCircle(10, 7, 4.5);
  g.fillStyle(0xe0524d);
  g.fillCircle(10, 7, 2.2);
  g.fillCircle(7, 11, 2);
  g.fillCircle(13, 11, 2);
  gen(propTexture('amber-clutch'));

  // Particle sprites for combat feedback (issue #3).
  g.clear();
  g.fillStyle(0x9fe06a);
  g.fillCircle(3, 3, 3);
  g.fillStyle(0x5b8f33);
  g.fillCircle(4, 4, 1.5);
  gen(TEX.ichor);

  g.clear();
  g.fillStyle(0xa855c8);
  g.fillTriangle(0, 8, 4, 0, 8, 8);
  g.fillStyle(0x7a3b8f);
  g.fillTriangle(2, 8, 4, 3, 6, 8);
  gen(TEX.shard);

  g.clear();
  g.fillStyle(0xffd75e);
  g.fillTriangle(3, 0, 6, 3, 3, 6);
  g.fillTriangle(3, 0, 0, 3, 3, 6);
  gen(TEX.spark);

  g.clear();
  g.fillStyle(0x8a7f96, 0.5);
  g.fillCircle(4, 4, 4);
  gen(TEX.dust);

  g.clear();
  g.fillStyle(0xe0524d);
  g.fillCircle(2, 2.5, 2);
  g.fillCircle(4.5, 2.5, 2);
  g.fillTriangle(0.5, 3.5, 6, 3.5, 3.2, 6.5);
  gen(TEX.heart);

  // Facing chevron (white, points +x; tinted per player and rotated).
  g.clear();
  g.fillStyle(0xffffff);
  g.fillTriangle(3, 2, 12, 7, 3, 12);
  g.fillStyle(0x000000, 0.35);
  g.fillTriangle(3, 4, 8, 7, 3, 10);
  gen(TEX.chevron);

  g.destroy();
}

/** Shared hero layout: body disc, shoulders, crest toward facing, weapon. */
function drawHeroFrame(g: Phaser.GameObjects.Graphics, style: HeroStyle, dir: number, pose: HeroPose, key: string): void {
  const C = 18; // center of the 36x36 frame
  const a = (dir * Math.PI) / 4;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const px = -dy; // perpendicular (left of facing)
  const py = dx;
  const stride = pose === 'w1' ? -2 : 2;

  g.clear();

  // Feet, behind the body, alternating along the facing axis when walking.
  g.fillStyle(style.feet);
  g.fillCircle(C - dx * 7 + px * 5 + dx * stride, C - dy * 7 + py * 5 + dy * stride, 3);
  g.fillCircle(C - dx * 7 - px * 5 - dx * stride, C - dy * 7 - py * 5 - dy * stride, 3);

  // Body.
  g.fillStyle(style.body);
  g.fillCircle(C, C, 11);
  g.fillStyle(style.inner);
  g.fillCircle(C - dx * 2, C - dy * 2, 6);
  g.lineStyle(2, style.outline);
  g.strokeCircle(C, C, 11);

  // Shoulders on the perpendicular axis.
  g.fillStyle(style.trim);
  g.fillCircle(C + px * 9, C + py * 9, 3.5);
  g.fillCircle(C - px * 9, C - py * 9, 3.5);

  // Crest marks the facing even when stationary.
  g.fillStyle(style.crest);
  g.fillCircle(C + dx * 5, C + dy * 5, 3);

  if (style.weapon === 'maul') {
    // Tower shield held to the left of the facing (broad enough to read at
    // 36px); a stubby maul juts forward, hoisted higher on the attack sweep.
    const sx = C - px * 8; // shield sits on the perpendicular (left) side
    const sy = C - py * 8;
    g.fillStyle(0x3b4049);
    g.fillEllipse(sx + dx, sy + dy, 15, 20); // shield backing/shadow
    g.fillStyle(style.trim);
    g.fillEllipse(sx, sy, 13, 18); // shield face
    g.fillStyle(style.inner);
    g.fillEllipse(sx, sy, 6, 11); // boss
    g.lineStyle(1.5, style.outline);
    g.strokeEllipse(sx, sy, 13, 18);

    // Maul: haft + heavy head out toward the facing (raised on attack).
    const reach = pose === 'atk' ? 16 : 12;
    const side = 5;
    const hx = C + dx * reach + px * side;
    const hy = C + dy * reach + py * side;
    g.lineStyle(3, 0x6a5636);
    g.lineBetween(C + px * side, C + py * side, hx, hy);
    g.fillStyle(style.weaponColor);
    g.fillCircle(hx, hy, pose === 'atk' ? 5 : 4);
    g.lineStyle(1.5, style.outline);
    g.strokeCircle(hx, hy, pose === 'atk' ? 5 : 4);
  } else if (style.weapon === 'bow') {
    // Shortbow held crosswise (across the facing) ahead of the body; on the
    // attack pose the stave bends and a nocked dart points along the facing.
    const fwd = pose === 'atk' ? 11 : 8;
    const bx = C + dx * fwd;
    const by = C + dy * fwd;
    const tip = pose === 'atk' ? 8 : 9; // limb half-length along the perpendicular
    const belly = pose === 'atk' ? 3 : 1; // how far the stave bows forward
    g.lineStyle(2, style.weaponColor);
    g.lineBetween(bx + px * tip, by + py * tip, bx + dx * belly, by + dy * belly);
    g.lineBetween(bx + dx * belly, by + dy * belly, bx - px * tip, by - py * tip);
    // Bowstring across the limb tips (drawn back toward the body on attack).
    const pull = pose === 'atk' ? -3 : 0;
    g.lineStyle(1, 0xe8e2d0, 0.85);
    g.lineBetween(bx + px * tip, by + py * tip, bx + dx * pull, by + dy * pull);
    g.lineBetween(bx + dx * pull, by + dy * pull, bx - px * tip, by - py * tip);
    if (pose === 'atk') {
      // Nocked thorn dart ready to loose.
      g.lineStyle(2, 0xf4ead0);
      g.lineBetween(bx + dx * pull, by + dy * pull, bx + dx * 9, by + dy * 9);
    }
  } else if (style.weapon === 'blade') {
    // Blade: held beside the body at rest, swung out front on attack.
    const reach = pose === 'atk' ? 15 : 13;
    const side = pose === 'atk' ? 0 : 4;
    g.lineStyle(pose === 'atk' ? 5 : 4, style.weaponColor);
    g.lineBetween(C + dx * 9 + px * 4, C + dy * 9 + py * 4, C + dx * reach + px * side, C + dy * reach + py * side);
  } else {
    // Staff: carried at the side; thrust forward with a flaring orb on cast.
    const side = pose === 'atk' ? 2 : 6;
    const reach = pose === 'atk' ? 15 : 11;
    g.lineStyle(2.5, 0x6a4a2e);
    g.lineBetween(C - dx * 6 + px * side, C - dy * 6 + py * side, C + dx * reach + px * side, C + dy * reach + py * side);
    g.fillStyle(style.weaponColor);
    g.fillCircle(C + dx * reach + px * side, C + dy * reach + py * side, pose === 'atk' ? 3.5 : 2.5);
    if (pose === 'atk') {
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(C + dx * reach + px * side, C + dy * reach + py * side, 1.6);
    }
  }

  gen(key);
}

/** A power-up relic: an aura disc, a bright gem, and a per-buff glyph. */
function drawRelic(
  g: Phaser.GameObjects.Graphics,
  key: string,
  color: number,
  bright: number,
  glyph: 'spike' | 'chevron' | 'shield'
): void {
  g.clear();
  g.fillStyle(color, 0.3);
  g.fillCircle(9, 9, 8.5); // soft aura
  g.fillStyle(color);
  g.fillCircle(9, 9, 5.5);
  g.fillStyle(bright);
  if (glyph === 'spike') {
    // A four-point burst for Frenzy.
    g.fillTriangle(9, 3, 11, 9, 7, 9);
    g.fillTriangle(9, 15, 11, 9, 7, 9);
    g.fillTriangle(3, 9, 9, 11, 9, 7);
    g.fillTriangle(15, 9, 9, 11, 9, 7);
  } else if (glyph === 'chevron') {
    // Forward chevrons for Swiftness.
    g.fillTriangle(6, 5, 11, 9, 6, 13);
    g.fillTriangle(9, 5, 14, 9, 9, 13);
  } else {
    // A little shield for Ward.
    g.fillRect(6, 5, 6, 4);
    g.fillTriangle(6, 9, 12, 9, 9, 14);
  }
  gen(key);
}

/** Egg mound in three damage states so hurt nodes read at a glance. */
/**
 * Mireveil, Mother of the Brood: a 96px layered brood-queen — swollen egg
 * abdomen, plated thorax, crowned head with mandibles. Drawn facing south (the
 * renderer rotates her). Damage tiers mirror the Brood Node language: intact →
 * fissured and leaking → carapace broken open around a burning core.
 */
function drawMireveil(g: Phaser.GameObjects.Graphics, tier: number): void {
  const c = 48; // canvas centre
  g.clear();

  // Egg-swollen abdomen: the bulk of the silhouette, sagging behind her.
  g.fillStyle(tier === 2 ? 0x5f2e70 : 0x6d3380);
  g.fillEllipse(c, c + 16, 74, 60);
  g.fillStyle(tier === 2 ? 0x7a3b8f : 0x8d45a6);
  g.fillEllipse(c, c + 14, 56, 44);
  // Brood sacs glowing through the shell — brighter as she is opened up.
  g.fillStyle(tier === 0 ? 0xc07fd8 : 0xe1a6f0);
  g.fillCircle(c - 16, c + 18, 7);
  g.fillCircle(c + 16, c + 18, 7);
  g.fillCircle(c, c + 28, 8);
  if (tier > 0) {
    g.fillStyle(0xfbe3ff);
    g.fillCircle(c - 16, c + 18, 3);
    g.fillCircle(c + 16, c + 18, 3);
    g.fillCircle(c, c + 28, 3.5);
  }

  // Plated thorax.
  g.fillStyle(0x4d2359);
  g.fillEllipse(c, c - 8, 46, 36);
  g.fillStyle(0x7a3b8f);
  g.fillEllipse(c, c - 10, 34, 26);

  // Legs braced either side (simple angled plates read at game scale).
  g.lineStyle(4, 0x3d1d49);
  g.lineBetween(c - 20, c - 6, c - 38, c + 6);
  g.lineBetween(c + 20, c - 6, c + 38, c + 6);
  g.lineBetween(c - 18, c + 8, c - 34, c + 26);
  g.lineBetween(c + 18, c + 8, c + 34, c + 26);

  // Crowned head and mandibles.
  g.fillStyle(0x8d45a6);
  g.fillEllipse(c, c - 28, 30, 24);
  g.fillStyle(0x2a1433);
  g.fillCircle(c - 7, c - 30, 3.5); // eyes
  g.fillCircle(c + 7, c - 30, 3.5);
  g.lineStyle(3, 0x3d1d49);
  g.lineBetween(c - 11, c - 18, c - 17, c - 6); // mandibles
  g.lineBetween(c + 11, c - 18, c + 17, c - 6);
  // Crown spines.
  g.lineStyle(3, 0x5f2e70);
  g.lineBetween(c - 10, c - 38, c - 14, c - 47);
  g.lineBetween(c, c - 41, c, c - 51);
  g.lineBetween(c + 10, c - 38, c + 14, c - 47);

  if (tier === 1) {
    // Fissures across the abdomen, weeping ichor.
    g.lineStyle(3, 0x2a1433);
    g.lineBetween(c - 24, c + 4, c - 10, c + 18);
    g.lineBetween(c - 10, c + 18, c - 18, c + 34);
    g.lineBetween(c + 22, c + 2, c + 12, c + 20);
    g.fillStyle(0xcf8fe0);
    g.fillCircle(c - 20, c + 40, 4);
    g.fillCircle(c + 16, c + 38, 3);
  } else if (tier === 2) {
    // Carapace broken open around a burning core; shell fragments shed.
    g.lineStyle(4, 0x1e0f26);
    g.lineBetween(c - 30, c - 2, c - 8, c + 16);
    g.lineBetween(c - 8, c + 16, c - 20, c + 38);
    g.lineBetween(c + 28, c - 4, c + 10, c + 18);
    g.lineBetween(c + 10, c + 18, c + 24, c + 36);
    g.fillStyle(0xe1a6f0);
    g.fillCircle(c, c + 12, 13);
    g.fillStyle(0xfbe3ff);
    g.fillCircle(c, c + 12, 6);
    g.fillStyle(0x3d1d49);
    g.fillCircle(c - 36, c + 40, 4);
    g.fillCircle(c + 34, c + 42, 3);
    g.fillCircle(c + 42, c + 30, 2.5);
  }
  gen(bossFrame('mireveil', tier));
}

function drawBroodNode(g: Phaser.GameObjects.Graphics, tier: number): void {
  g.clear();
  if (tier < 2) {
    g.fillStyle(0x7a3b8f);
    g.fillCircle(22, 22, 20);
    g.fillStyle(0xa855c8);
    g.fillCircle(22, 18, 13);
    g.fillStyle(0xe1a6f0);
    g.fillCircle(22, 15, 6);
    g.lineStyle(2, 0x3d1d49);
    g.strokeCircle(22, 22, 20);
    if (tier === 1) {
      // Cracks across the dome plus an ichor leak pooling at the base.
      g.lineStyle(2, 0x3d1d49);
      g.lineBetween(12, 12, 19, 22);
      g.lineBetween(19, 22, 15, 33);
      g.lineBetween(30, 9, 27, 20);
      g.lineBetween(27, 20, 33, 28);
      g.fillStyle(0xcf8fe0);
      g.fillCircle(15, 38, 3);
      g.fillCircle(12, 41, 2);
    }
  } else {
    // Crumbling: deflated husk, heavy fractures, exposed glowing core, rubble.
    g.fillStyle(0x5f2e70);
    g.fillEllipse(22, 26, 40, 32);
    g.fillStyle(0x7a3b8f);
    g.fillEllipse(22, 24, 28, 22);
    g.lineStyle(3, 0x2a1433);
    g.lineBetween(8, 20, 20, 27);
    g.lineBetween(20, 27, 14, 38);
    g.lineBetween(34, 15, 27, 26);
    g.lineBetween(27, 26, 36, 33);
    g.fillStyle(0xe1a6f0);
    g.fillCircle(22, 23, 7);
    g.fillStyle(0xfbe3ff);
    g.fillCircle(22, 23, 3);
    g.fillStyle(0x3d1d49);
    g.fillCircle(6, 38, 3);
    g.fillCircle(39, 36, 2.5);
    g.fillCircle(33, 40, 2);
  }
  gen(generatorFrame('brood-node', tier));
}

/** Squat bone-and-chitin mound: a broad, armoured heavy-spawner silhouette. */
function drawHuskMound(g: Phaser.GameObjects.Graphics, tier: number): void {
  g.clear();
  g.fillStyle(0x241910);
  g.fillEllipse(22, 36, 40, 10);
  g.fillStyle(tier === 2 ? 0x6d5738 : 0x8f7448);
  g.fillEllipse(22, tier === 2 ? 29 : 27, 38, tier === 2 ? 20 : 26);
  g.fillStyle(0xc8b47d);
  g.fillTriangle(5, 29, 13, 8 + tier * 5, 18, 31);
  g.fillTriangle(26, 31, 33, 6 + tier * 6, 40, 30);
  g.fillStyle(0xe5d7a8);
  g.fillTriangle(16, 28, 22, 4 + tier * 5, 28, 28);
  g.lineStyle(3, 0x4a3821);
  g.strokeEllipse(22, tier === 2 ? 29 : 27, 38, tier === 2 ? 20 : 26);
  if (tier >= 1) {
    g.lineBetween(10, 24, 20, 29);
    g.lineBetween(20, 29, 17, 38);
    g.lineBetween(33, 21, 25, 29);
  }
  if (tier === 2) {
    g.fillStyle(0xf1dfad);
    g.fillCircle(22, 30, 5);
    g.fillStyle(0x4a3821);
    g.fillCircle(5, 38, 3);
    g.fillCircle(39, 37, 3);
  }
  gen(generatorFrame('husk-mound', tier));
}

/** Bulbous venom sacs and raised vents make the ranged nest read vertically. */
function drawSpitterNest(g: Phaser.GameObjects.Graphics, tier: number): void {
  g.clear();
  g.fillStyle(0x162713);
  g.fillEllipse(22, 37, 36, 8);
  const sac = tier === 2 ? 0x486d2c : 0x65963c;
  const glow = tier === 2 ? 0xc9f06b : 0xa9df55;
  g.fillStyle(0x314d23);
  g.fillCircle(13, 29, tier === 2 ? 8 : 11);
  g.fillCircle(31, 29, tier === 2 ? 8 : 11);
  g.fillStyle(sac);
  g.fillCircle(22, tier === 2 ? 28 : 23, tier === 2 ? 10 : 14);
  g.fillStyle(glow);
  g.fillCircle(19, tier === 2 ? 26 : 20, tier === 2 ? 3 : 5);
  g.lineStyle(4, 0x314d23);
  g.lineBetween(17, 17 + tier * 4, 12, 7 + tier * 7);
  g.lineBetween(27, 17 + tier * 4, 33, 8 + tier * 7);
  g.fillStyle(glow);
  g.fillEllipse(11, 7 + tier * 7, 8, 4);
  g.fillEllipse(34, 8 + tier * 7, 8, 4);
  g.lineStyle(2, 0x1f3519);
  if (tier >= 1) {
    g.lineBetween(14, 20, 23, 28);
    g.lineBetween(23, 28, 18, 37);
    g.fillStyle(0x8bc946);
    g.fillCircle(29, 38, 3);
  }
  if (tier === 2) {
    g.fillStyle(0xd8ff7a);
    g.fillCircle(22, 29, 5);
    g.fillStyle(0x314d23);
    g.fillCircle(7, 38, 3);
    g.fillCircle(38, 37, 2);
  }
  gen(generatorFrame('spitter-nest', tier));
}

/** Dispatch: one draw routine per silhouette family, palette from the tier. */
function drawEnemyFrame(g: Phaser.GameObjects.Graphics, family: EnemyFamily, tier: EnemyTier, frame: EnemyAnimFrame): void {
  const pal = TIER_PALETTES[tier];
  const key = enemyFrame(family, tier, frame);
  g.clear();
  if (family === 'skitter') drawSkitter(g, pal, frame, key);
  else if (family === 'husk') drawHusk(g, pal, frame, key);
  else drawSpitter(g, pal, frame, key);
}

/** Skitter: small round swarmer facing +x — legs, oval body, forward eyes. */
function drawSkitter(g: Phaser.GameObjects.Graphics, pal: TierPalette, frame: EnemyAnimFrame, key: string): void {
  const raised = frame === 'windup';
  const splay = frame === 'w1' ? -1 : 1;

  g.lineStyle(2, raised ? pal.brightDark : pal.dark);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const bx = 8 + i * 4;
      const lean = (i - 1) * 2 * splay;
      g.lineBetween(bx, 12 + s * 4, bx + lean, 12 + s * (raised ? 11 : 9));
    }
  }

  if (pal.glow !== undefined) {
    g.lineStyle(2, pal.glow, 0.85);
    g.strokeEllipse(12, 12, 20, 14);
  }
  g.fillStyle(raised ? pal.bright : pal.body);
  g.fillEllipse(12, 12, raised ? 18 : 17, raised ? 13 : 11);
  g.fillStyle(raised ? pal.brightDark : pal.dark);
  g.fillEllipse(8, 12, 8, raised ? 9 : 7);

  // Eyes flare during the attack windup so the telegraph is unmissable.
  g.fillStyle(raised ? pal.windupEye : pal.eye);
  g.fillCircle(17, 9.5, 2);
  g.fillCircle(17, 14.5, 2);

  gen(key);
}

/** Husk: tall lumbering bruiser — broad plated torso, heavy arms, small head. */
function drawHusk(g: Phaser.GameObjects.Graphics, pal: TierPalette, frame: EnemyAnimFrame, key: string): void {
  const raised = frame === 'windup';
  const sway = frame === 'w1' ? -1.5 : 1.5;

  // Stumpy legs behind the torso.
  g.fillStyle(pal.dark);
  g.fillCircle(10, 10 + sway, 3.5);
  g.fillCircle(10, 22 - sway, 3.5);

  // Heavy arms: forward at rest, hauled up overhead during the windup.
  g.lineStyle(5, raised ? pal.brightDark : pal.dark);
  if (raised) {
    g.lineBetween(17, 9, 23, 3);
    g.lineBetween(17, 23, 23, 29);
  } else {
    g.lineBetween(17, 9, 25, 7 + sway);
    g.lineBetween(17, 23, 25, 25 - sway);
  }

  if (pal.glow !== undefined) {
    g.lineStyle(2, pal.glow, 0.85);
    g.strokeEllipse(15, 16, 25, 21);
  }
  g.fillStyle(raised ? pal.bright : pal.body);
  g.fillEllipse(15, 16, 22, 18);
  // Back armor plates.
  g.fillStyle(raised ? pal.brightDark : pal.dark);
  g.fillEllipse(10, 16, 10, 14);
  g.fillEllipse(14, 16, 6, 16);

  // Small head tucked at the front.
  g.fillStyle(pal.dark);
  g.fillCircle(25, 16, 4.5);
  g.fillStyle(raised ? pal.windupEye : pal.eye);
  g.fillCircle(27, 14, 1.7);
  g.fillCircle(27, 18, 1.7);

  gen(key);
}

/** Spitter: ranged shape — bulbous rear sac, thin body, unmistakable funnel head. */
function drawSpitter(g: Phaser.GameObjects.Graphics, pal: TierPalette, frame: EnemyAnimFrame, key: string): void {
  const raised = frame === 'windup';
  const splay = frame === 'w1' ? -1 : 1;

  // Two pairs of thin legs.
  g.lineStyle(1.5, pal.dark);
  for (const s of [-1, 1]) {
    g.lineBetween(11, 12 + s * 3, 9 + splay, 12 + s * 9);
    g.lineBetween(15, 12 + s * 3, 17 - splay, 12 + s * 9);
  }

  if (pal.glow !== undefined) {
    g.lineStyle(2, pal.glow, 0.85);
    g.strokeEllipse(13, 12, 16, 11);
  }
  // Rear sac inflates during the windup (about to spit).
  g.fillStyle(raised ? pal.bright : pal.dark);
  g.fillCircle(7, 12, raised ? 6.5 : 5);
  // Thin body.
  g.fillStyle(raised ? pal.bright : pal.body);
  g.fillEllipse(13, 12, 12, 8);
  // Funnel mouth: the family's identifying silhouette. Splits open on windup.
  g.fillStyle(raised ? pal.brightDark : pal.body);
  if (raised) {
    g.fillTriangle(17, 9, 26, 6, 20, 11);
    g.fillTriangle(17, 15, 26, 18, 20, 13);
  } else {
    g.fillTriangle(17, 9, 26, 12, 17, 15);
  }
  g.fillStyle(raised ? pal.windupEye : pal.eye);
  g.fillCircle(16, 8, 1.6);
  g.fillCircle(16, 16, 1.6);

  gen(key);
}
