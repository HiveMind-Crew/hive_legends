import Phaser from 'phaser';
import { ENEMY_FAMILIES, ENEMY_TIERS, type EnemyFamily, type EnemyTier } from '../sim/types';

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
  wallFace: 'tile-wall-face',
  floor: 'tile-floor',
  hero: 'hero-vanguard', // portrait alias (south-facing idle frame)
  gold: 'pickup-gold',
  health: 'pickup-health',
  exit: 'exit-portal',
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

export function heroFrame(dir: number, pose: HeroPose): string {
  return `hero-vanguard-${dir}-${pose}`;
}

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

/** Damage tiers: 0 intact, 1 cracked/leaking, 2 crumbling. */
export function broodNodeFrame(tier: number): string {
  return `generator-brood-node-${tier}`;
}

/** Maps a facing vector to one of 8 direction indices (0 = east, clockwise). */
export function facingDirIndex(x: number, y: number): number {
  const idx = Math.round(Math.atan2(y, x) / (Math.PI / 4));
  return ((idx % 8) + 8) % 8;
}

export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

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
  g.generateTexture(TEX.wall, 32, 32);

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
  g.generateTexture(TEX.wallFace, 32, 16);

  // Floor tile: mottled warren dirt.
  g.clear();
  g.fillStyle(0x17131f);
  g.fillRect(0, 0, 32, 32);
  g.fillStyle(0x1d1827);
  g.fillRect(2, 2, 6, 6);
  g.fillRect(20, 12, 7, 7);
  g.fillRect(8, 22, 5, 5);
  g.generateTexture(TEX.floor, 32, 32);

  // Hero frame set: 8 directions x (walk0, walk1, attack).
  for (let dir = 0; dir < 8; dir++) {
    drawHeroFrame(g, dir, 'w0', heroFrame(dir, 'w0'));
    drawHeroFrame(g, dir, 'w1', heroFrame(dir, 'w1'));
    drawHeroFrame(g, dir, 'atk', heroFrame(dir, 'atk'));
  }
  // Portrait alias for menus: south-facing idle.
  drawHeroFrame(g, 2, 'w0', TEX.hero);

  // Enemy frame sets: every silhouette family x palette tier x anim frame
  // (drawn facing +x; the scene rotates the sprite).
  for (const family of ENEMY_FAMILIES) {
    for (const tier of ENEMY_TIERS) {
      for (const frame of ['w0', 'w1', 'windup'] as const) {
        drawEnemyFrame(g, family, tier, frame);
      }
    }
  }

  // Brood Node damage tiers: intact → cracked/leaking → crumbling.
  drawBroodNode(g, 0);
  drawBroodNode(g, 1);
  drawBroodNode(g, 2);

  // Gold coin.
  g.clear();
  g.fillStyle(0xffd75e);
  g.fillCircle(8, 8, 7);
  g.fillStyle(0xb8922e);
  g.fillCircle(8, 8, 4);
  g.generateTexture(TEX.gold, 16, 16);

  // Health: hearty red morsel.
  g.clear();
  g.fillStyle(0xe0524d);
  g.fillCircle(6, 9, 5);
  g.fillCircle(12, 9, 5);
  g.fillTriangle(2, 11, 16, 11, 9, 17);
  g.generateTexture(TEX.health, 18, 18);

  // Exit portal: glowing ring.
  g.clear();
  g.lineStyle(4, 0x64e6ff);
  g.strokeCircle(24, 24, 18);
  g.lineStyle(2, 0xbdf4ff);
  g.strokeCircle(24, 24, 11);
  g.generateTexture(TEX.exit, 48, 48);

  // Elliptical drop shadow (alpha baked in; scaled per entity).
  g.clear();
  g.fillStyle(0x000000, 0.4);
  g.fillEllipse(16, 7, 28, 10);
  g.generateTexture(TEX.shadow, 32, 14);

  // Player accent underglow ring (white; tinted per player, squashed to ground).
  g.clear();
  g.lineStyle(3, 0xffffff);
  g.strokeCircle(20, 20, 15);
  g.generateTexture(TEX.accentRing, 40, 40);

  // Particle sprites for combat feedback (issue #3).
  g.clear();
  g.fillStyle(0x9fe06a);
  g.fillCircle(3, 3, 3);
  g.fillStyle(0x5b8f33);
  g.fillCircle(4, 4, 1.5);
  g.generateTexture(TEX.ichor, 6, 6);

  g.clear();
  g.fillStyle(0xa855c8);
  g.fillTriangle(0, 8, 4, 0, 8, 8);
  g.fillStyle(0x7a3b8f);
  g.fillTriangle(2, 8, 4, 3, 6, 8);
  g.generateTexture(TEX.shard, 8, 8);

  g.clear();
  g.fillStyle(0xffd75e);
  g.fillTriangle(3, 0, 6, 3, 3, 6);
  g.fillTriangle(3, 0, 0, 3, 3, 6);
  g.generateTexture(TEX.spark, 6, 6);

  g.clear();
  g.fillStyle(0x8a7f96, 0.5);
  g.fillCircle(4, 4, 4);
  g.generateTexture(TEX.dust, 8, 8);

  g.clear();
  g.fillStyle(0xe0524d);
  g.fillCircle(2, 2.5, 2);
  g.fillCircle(4.5, 2.5, 2);
  g.fillTriangle(0.5, 3.5, 6, 3.5, 3.2, 6.5);
  g.generateTexture(TEX.heart, 7, 7);

  // Facing chevron (white, points +x; tinted per player and rotated).
  g.clear();
  g.fillStyle(0xffffff);
  g.fillTriangle(3, 2, 12, 7, 3, 12);
  g.fillStyle(0x000000, 0.35);
  g.fillTriangle(3, 4, 8, 7, 3, 10);
  g.generateTexture(TEX.chevron, 14, 14);

  g.destroy();
}

/** Armored vanguard: body disc, pauldrons, helm crest toward facing, blade. */
function drawHeroFrame(g: Phaser.GameObjects.Graphics, dir: number, pose: HeroPose, key: string): void {
  const C = 18; // center of the 36x36 frame
  const a = (dir * Math.PI) / 4;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const px = -dy; // perpendicular (left of facing)
  const py = dx;
  const stride = pose === 'w1' ? -2 : 2;

  g.clear();

  // Feet, behind the body, alternating along the facing axis when walking.
  g.fillStyle(0x1c2c44);
  g.fillCircle(C - dx * 7 + px * 5 + dx * stride, C - dy * 7 + py * 5 + dy * stride, 3);
  g.fillCircle(C - dx * 7 - px * 5 - dx * stride, C - dy * 7 - py * 5 - dy * stride, 3);

  // Body and armor.
  g.fillStyle(0x5a8fd9);
  g.fillCircle(C, C, 11);
  g.fillStyle(0x2f5a8c);
  g.fillCircle(C - dx * 2, C - dy * 2, 6);
  g.lineStyle(2, 0x14243d);
  g.strokeCircle(C, C, 11);

  // Pauldrons on the perpendicular axis.
  g.fillStyle(0x87b1e8);
  g.fillCircle(C + px * 9, C + py * 9, 3.5);
  g.fillCircle(C - px * 9, C - py * 9, 3.5);

  // Helm crest marks the facing even when stationary.
  g.fillStyle(0xd9e6f4);
  g.fillCircle(C + dx * 5, C + dy * 5, 3);

  // Blade: held beside the body at rest, swung out front on attack.
  const reach = pose === 'atk' ? 15 : 13;
  const side = pose === 'atk' ? 0 : 4;
  g.lineStyle(pose === 'atk' ? 5 : 4, 0xd9e6f4);
  g.lineBetween(C + dx * 9 + px * 4, C + dy * 9 + py * 4, C + dx * reach + px * side, C + dy * reach + py * side);

  g.generateTexture(key, 36, 36);
}

/** Egg mound in three damage states so hurt nodes read at a glance. */
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
  g.generateTexture(broodNodeFrame(tier), 44, 44);
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

  g.generateTexture(key, 24, 24);
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

  g.generateTexture(key, 32, 32);
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

  g.generateTexture(key, 28, 24);
}
