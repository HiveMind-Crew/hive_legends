import type { BossDef } from '../sim/types';

/**
 * Realm-1 finale (issue #25): Mireveil, Mother of the Brood — an original
 * creature that turns the generator fantasy into a fight. She *is* the hive's
 * womb, so her signature move births a clutch rather than shooting.
 *
 * Every number here is content data; the sim only reads it. The fight is
 * authored to be learnable: she telegraphs for a full second before anything
 * that can hurt you, and her pursuit is slower than every hero, so circling is
 * always an out. Escalation comes from pace and move variety, not raw numbers.
 */
export const MIREVEIL: BossDef = {
  id: 'mireveil',
  name: 'Mireveil',
  title: 'Mother of the Brood',
  maxHp: 900,
  radius: 34,
  touchDamage: 12,
  touchCooldownTicks: 45,
  // 60 ticks = 1 s. The readability rule asks for >= 45; a content test guards it.
  telegraphTicks: 60,
  phases: [
    {
      // Opening: she lumbers after you and keeps birthing swarmers.
      name: 'The Brood Stirs',
      hpFraction: 1,
      moveSpeed: 52,
      actionIntervalTicks: 240, // ~4 s between calls
      actions: ['brood-call']
    },
    {
      // Wounded: she starts throwing her bulk at you between clutches.
      name: 'The Mother Rages',
      hpFraction: 0.6,
      moveSpeed: 62,
      actionIntervalTicks: 180,
      actions: ['lunge', 'brood-call']
    },
    {
      // Dying: faster cycles and spat resin globs on top of everything else.
      name: "Mireveil's Last Clutch",
      hpFraction: 0.25,
      moveSpeed: 72,
      actionIntervalTicks: 120,
      actions: ['glob', 'lunge', 'brood-call']
    }
  ],
  broodCall: { enemyId: 'skitterling', count: 3 },
  lunge: { speed: 420, durationTicks: 26, damage: 22 },
  glob: {
    count: 5,
    spreadDeg: 60,
    projectileSpeed: 230,
    projectileRadius: 6,
    projectileDamage: 10,
    projectileRange: 420
  },
  goldDrop: 150
};

export const BOSSES: Record<string, BossDef> = {
  [MIREVEIL.id]: MIREVEIL
};
