import { ENEMY_FAMILIES, ENEMY_TIERS, type EnemyFamily } from '../sim/types';

/**
 * The single source of truth for every texture key and its canvas size.
 * The generator (`textures.ts`) reads sizes from here, the boot loader uses
 * it to accept drop-in art overrides (`public/art/<key>.png`) and to reject
 * wrong-sized files, and `docs/ART.md` documents it for artists.
 *
 * This module is Phaser-free on purpose so unit tests can import it.
 */

export interface TextureSpec {
  w: number;
  h: number;
}

const ENEMY_FAMILY_SIZES: Record<EnemyFamily, TextureSpec> = {
  skitter: { w: 24, h: 24 },
  husk: { w: 32, h: 32 },
  spitter: { w: 28, h: 24 }
};

const ENEMY_ANIM_FRAMES = ['w0', 'w1', 'windup'] as const;
const HERO_POSES = ['w0', 'w1', 'atk'] as const;

function buildSpecs(): Record<string, TextureSpec> {
  const specs: Record<string, TextureSpec> = {};
  const add = (key: string, w: number, h: number): void => {
    specs[key] = { w, h };
  };

  // Tiles.
  add('tile-wall', 32, 32);
  add('tile-wall-inner', 32, 32);
  add('tile-wall-face', 32, 16);
  for (let v = 0; v < 4; v++) add(`tile-floor-${v}`, 32, 32);

  // Hero frames: roster x 8 directions x poses, plus the portrait alias.
  for (const heroId of ['vanguard', 'arcanist', 'ranger', 'sentinel']) {
    for (let dir = 0; dir < 8; dir++) {
      for (const pose of HERO_POSES) add(`hero-${heroId}-${dir}-${pose}`, 36, 36);
    }
    add(`hero-${heroId}`, 36, 36);
  }

  // Enemy frames: family x tier x animation frame.
  for (const family of ENEMY_FAMILIES) {
    const size = ENEMY_FAMILY_SIZES[family];
    for (const tier of ENEMY_TIERS) {
      for (const frame of ENEMY_ANIM_FRAMES) {
        add(`enemy-${family}-${tier}-${frame}`, size.w, size.h);
      }
    }
  }

  // Generators (damage tiers), props, pickups, exit.
  for (let t = 0; t < 3; t++) add(`generator-brood-node-${t}`, 44, 44);
  // Boss (issue #25): damage tiers like the Brood Nodes, at finale scale.
  for (let t = 0; t < 3; t++) add(`boss-mireveil-${t}`, 96, 96);
  add('prop-resin-husk', 20, 20);
  add('prop-amber-clutch', 20, 20);
  add('pickup-gold', 16, 16);
  add('pickup-health', 18, 18);
  add('pickup-frenzy', 18, 18);
  add('pickup-swiftness', 18, 18);
  add('pickup-ward', 18, 18);
  add('pickup-key', 18, 18);
  add('pickup-potion', 18, 18);
  add('level-gate', 32, 32);
  add('exit-portal', 48, 48);

  // Decor.
  add('decor-egg-cluster', 24, 20);
  add('decor-resin-web', 28, 28);
  add('decor-spore-patch', 24, 18);

  // Effects / particles.
  add('fx-shadow', 32, 14);
  add('fx-accent-ring', 40, 40);
  add('fx-chevron', 14, 14);
  add('fx-glow', 48, 48);
  add('fx-mote', 4, 4);
  add('fx-bolt', 12, 6);
  add('fx-ichor', 6, 6);
  add('fx-shard', 8, 8);
  add('fx-spark', 6, 6);
  add('fx-dust', 8, 8);
  add('fx-heart', 7, 7);

  return specs;
}

export const TEXTURE_SPECS: Readonly<Record<string, TextureSpec>> = buildSpecs();
