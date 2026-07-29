import type { AttackDef, EnemyAttackDef, EnemyFamily } from '../sim/types';

/**
 * Pure presentation vocabulary for issue #80. Audio and visuals consume this
 * mapping; the deterministic sim only emits identity and authored weight.
 */

export type AttackVoice = 'pike' | 'maul' | 'hexbolt' | 'thornbow' | 'skitter' | 'husk' | 'spitter' | 'ravager';

export interface AttackCue {
  voice: AttackVoice;
  color: number;
  /** Normalized authored damage, used only to scale presentation weight. */
  heft: number;
}

function normalizeWeight(weight: number): number {
  return Math.max(0, Math.min(1, (weight - 8) / 36));
}

export function heroAttackCue(heroId: string, kind: AttackDef['kind'], weight: number): AttackCue {
  const heft = normalizeWeight(weight);
  if (heroId === 'vanguard') return { voice: 'pike', color: 0xffd75e, heft };
  if (heroId === 'sentinel') return { voice: 'maul', color: 0xc2c8d2, heft };
  if (heroId === 'arcanist') return { voice: 'hexbolt', color: 0xa855c8, heft };
  if (heroId === 'ranger') return { voice: 'thornbow', color: 0x7be08a, heft };
  return kind === 'melee'
    ? { voice: 'pike', color: 0xf4e3b2, heft }
    : { voice: 'thornbow', color: 0x64e6ff, heft };
}

export function enemyAttackCue(
  family: EnemyFamily,
  kind: EnemyAttackDef['kind'],
  weight: number
): AttackCue {
  const heft = normalizeWeight(weight);
  if (family === 'skitter') return { voice: 'skitter', color: 0xd6ef62, heft };
  if (family === 'spitter') return { voice: 'spitter', color: 0xb7ef56, heft };
  if (kind === 'line') return { voice: 'ravager', color: 0xff8a7a, heft };
  return { voice: 'husk', color: 0xe6b45a, heft };
}
