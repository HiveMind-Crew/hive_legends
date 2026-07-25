import { TICK_RATE } from '../src/sim/types';
import type { AttackDef, ContentDb, HeroDef, WeaponDef } from '../src/sim/types';

/**
 * Derives every combat table in docs/COMBAT.md from src/content, so the
 * numbers a reviewer reads can never drift from the numbers the sim runs.
 *
 * Nothing here is authored: the prose in COMBAT.md states the *intent*, this
 * file computes the *consequences*. `tests/combatDoc.test.ts` fails the build
 * when the checked-in block no longer matches this output.
 */

export const BEGIN_MARKER = '<!-- BEGIN GENERATED: combat-tables -->';
export const END_MARKER = '<!-- END GENERATED: combat-tables -->';

// ---------------------------------------------------------------------------
// Derived quantities
// ---------------------------------------------------------------------------

/** Sustained single-target damage per second at a given attack's cadence. */
export function dps(atk: AttackDef): number {
  return (atk.damage * TICK_RATE) / atk.cooldownTicks;
}

/**
 * How many enemies one use of the attack can damage. A bolt hits its first
 * target plus `pierce` more; a melee swing hits everything inside its arc, so
 * it has no fixed ceiling.
 */
export function targetsPerUse(atk: AttackDef): number | null {
  return atk.kind === 'projectile' ? atk.pierce + 1 : null;
}

/** Area a melee arc sweeps, in px² — the melee analogue of pierce. */
export function sweptArea(atk: AttackDef): number | null {
  if (atk.kind !== 'melee') return null;
  return (atk.arcDeg / 360) * Math.PI * atk.range * atk.range;
}

/**
 * Fraction of the time a single target stays frozen under sustained fire.
 * Every hit applies `enemyHitstunTicks`; a cadence at or below that value
 * refreshes the stun before it lapses, which is a permanent lockout.
 */
export function lockdownFraction(atk: AttackDef, enemyHitstunTicks: number): number {
  return Math.min(1, enemyHitstunTicks / atk.cooldownTicks);
}

/** True when this cadence can hold a single target stunned indefinitely. */
export function stunlocks(atk: AttackDef, enemyHitstunTicks: number): boolean {
  return atk.cooldownTicks <= enemyHitstunTicks;
}

/** The hero's attack with a weapon tier's overrides applied. */
export function attackForWeapon(hero: HeroDef, weapon: WeaponDef): AttackDef {
  return { ...hero.attack, ...weapon.attackOverrides } as AttackDef;
}

/** Weapon tiers for a hero, tier 1 first. */
function tiersFor(content: ContentDb, heroId: string): WeaponDef[] {
  return Object.values(content.weapons)
    .filter((w) => w.heroId === heroId)
    .sort((a, b) => a.tier - b.tier);
}

function heroList(content: ContentDb): HeroDef[] {
  return Object.values(content.heroes);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const n1 = (v: number): string => v.toFixed(1);
const n2 = (v: number): string => v.toFixed(2);
const secs = (ticks: number): string => `${(ticks / TICK_RATE).toFixed(2)} s`;
const pct = (v: number): string => `${Math.round(v * 100)}%`;

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`);
  return [head, rule, ...body].join('\n');
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** "starter", "120g", "1 clear + 160g" — only the gates that actually apply. */
function recruitText(hero: HeroDef): string {
  if (!hero.unlock) return 'starter';
  const clears = hero.unlock.missionsCompleted ?? 0;
  const gold = hero.unlock.goldCost ?? 0;
  const gates: string[] = [];
  if (clears > 0) gates.push(`${clears} clear${clears === 1 ? '' : 's'}`);
  if (gold > 0) gates.push(`${gold}g`);
  return gates.join(' + ') || 'starter';
}

function rosterTable(content: ContentDb): string {
  const rows = heroList(content).map((h) => [
    h.name,
    h.role,
    String(h.maxHp),
    String(h.moveSpeed),
    h.attack.kind,
    h.attack.kind === 'melee' ? `${h.attack.range} px arc` : `${h.attack.range} px bolt`,
    h.ability.name,
    recruitText(h)
  ]);
  return table(['Hero', 'Role', 'HP', 'Speed', 'Attack', 'Reach', 'Ability', 'Recruit'], rows);
}

function weaponTable(content: ContentDb): string {
  const rows: string[][] = [];
  for (const hero of heroList(content)) {
    for (const w of tiersFor(content, hero.id)) {
      const atk = attackForWeapon(hero, w);
      const shape =
        atk.kind === 'melee'
          ? `${atk.arcDeg}° / ${atk.range} px`
          : `pierce ${atk.pierce} / ${atk.range} px @ ${atk.speed} px/s`;
      rows.push([
        hero.role,
        `T${w.tier}`,
        w.name,
        w.cost === 0 ? '—' : `${w.cost}g`,
        String(atk.damage),
        `${atk.cooldownTicks}t`,
        n1(dps(atk)),
        shape,
        String(atk.knockback)
      ]);
    }
  }
  return table(['Hero', 'Tier', 'Weapon', 'Cost', 'Dmg', 'Cadence', 'DPS', 'Shape', 'Knockback'], rows);
}

function throughputTable(content: ContentDb): string {
  const hitstun = content.combat.enemyHitstunTicks;
  const rows: string[][] = [];
  for (const hero of heroList(content)) {
    for (const w of tiersFor(content, hero.id)) {
      const atk = attackForWeapon(hero, w);
      const targets = targetsPerUse(atk);
      const area = sweptArea(atk);
      // Crowd throughput: damage per second times what one use can reach.
      // Projectiles multiply by their pierce count; melee by swept area (in
      // 1000 px² units) so the two shapes land on a comparable scale.
      const crowd = targets !== null ? dps(atk) * targets : dps(atk) * ((area ?? 0) / 1000);
      rows.push([
        hero.role,
        `T${w.tier}`,
        n1(dps(atk)),
        targets !== null ? String(targets) : 'arc',
        area !== null ? `${Math.round(area)} px²` : '—',
        n1(crowd),
        pct(lockdownFraction(atk, hitstun)) + (stunlocks(atk, hitstun) ? ' ⚠️' : '')
      ]);
    }
  }
  return table(
    ['Hero', 'Tier', 'Single-target DPS', 'Targets/use', 'Swept area', 'Crowd score', 'Lockdown uptime'],
    rows
  );
}

function abilityTable(content: ContentDb): string {
  const rows = heroList(content).map((h) => {
    const a = h.ability;
    let damage = '—';
    let shape = '—';
    let control = '—';
    if (a.kind === 'blast') {
      damage = String(a.damage);
      shape = `r${a.radius}${a.offsetPx ? ` @ +${a.offsetPx} px ahead` : ' (self)'}`;
      const parts: string[] = [];
      if (a.knockback > 0) parts.push(`${a.knockback} knockback`);
      if (a.slowTicks) parts.push(`${secs(a.slowTicks)} slow ×${a.slowMult ?? 0.5}`);
      control = parts.join(', ') || '—';
    } else if (a.kind === 'dash-volley') {
      damage = 'basic attack ×' + a.dartCount;
      shape = `${a.dashPx} px dash, ${a.spreadDeg}° rear fan`;
      control = 'reposition';
    } else {
      shape = `${secs(a.durationTicks)} stance`;
      control = `×${a.damageMult} damage taken, ×${a.moveMult} speed, ${a.reflectKnockback} reflect`;
    }
    return [h.role, a.name, a.kind, secs(a.cooldownTicks), damage, shape, control];
  });
  return table(['Hero', 'Ability', 'Kind', 'Cooldown', 'Damage', 'Shape', 'Effect'], rows);
}

function ttkTable(content: ContentDb): string {
  const enemies = Object.values(content.enemies);
  const rows: string[][] = [];
  for (const hero of heroList(content)) {
    for (const w of tiersFor(content, hero.id)) {
      const d = dps(attackForWeapon(hero, w));
      rows.push([hero.role, `T${w.tier}`, ...enemies.map((e) => n2(e.maxHp / d))]);
    }
  }
  return table(['Hero', 'Tier', ...enemies.map((e) => `${e.name} (${e.maxHp} hp)`)], rows);
}

function swarmThresholdTable(content: ContentDb): string {
  // The roster's cheapest enemy is the yardstick every burst is measured
  // against: "does one press clear a clutch of these, or merely wound them?"
  const baseline = Object.values(content.enemies).reduce((a, b) => (a.maxHp <= b.maxHp ? a : b));
  const rows: string[][] = [];
  for (const hero of heroList(content)) {
    const a = hero.ability;
    if (a.kind !== 'blast') continue;
    rows.push([
      hero.role,
      a.name,
      String(a.damage),
      String(baseline.maxHp),
      a.damage >= baseline.maxHp ? 'clears' : `leaves ${baseline.maxHp - a.damage} hp`,
      a.slowTicks ? `yes (${secs(a.slowTicks)})` : 'no'
    ]);
  }
  rows.push([
    'Consumable',
    content.potion.name,
    String(content.potion.damage),
    String(baseline.maxHp),
    content.potion.damage >= baseline.maxHp ? 'clears' : `leaves ${baseline.maxHp - content.potion.damage} hp`,
    'no'
  ]);
  return table(['Source', 'Burst', 'Damage', `${baseline.name} hp`, 'Result', 'Control'], rows);
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** The full generated markdown block, marker lines included. */
export function renderCombatTables(content: ContentDb): string {
  const hitstun = content.combat.enemyHitstunTicks;
  const sections = [
    BEGIN_MARKER,
    '',
    '<!-- Do not edit by hand. Regenerate with `npm run docs:combat`. -->',
    '',
    '### Roster at a glance',
    '',
    rosterTable(content),
    '',
    '### Attacks by weapon tier',
    '',
    `Cadence is in ticks at ${TICK_RATE} Hz; DPS is \`damage × ${TICK_RATE} / cooldownTicks\`, before`,
    'upgrades, hero level and the frenzy relic — all of which scale damage only, never cadence.',
    '',
    weaponTable(content),
    '',
    '### Throughput and lockdown',
    '',
    'Crowd score weighs sustained DPS by what a single use can reach: pierce count for bolts,',
    'swept area (per 1000 px²) for arcs. It compares shapes coarsely — treat it as a smell test,',
    'not a balance target.',
    '',
    `Lockdown uptime is \`${hitstun} hitstun ticks / cadence\`: the share of the time one target`,
    'stays frozen under sustained fire. A ⚠️ marks a cadence at or below the hitstun window,',
    'which re-stuns before the previous stun lapses and locks that target out permanently.',
    '',
    throughputTable(content),
    '',
    '### Abilities',
    '',
    abilityTable(content),
    '',
    '### Burst vs the swarm threshold',
    '',
    'Whether one press of a burst actually clears the roster’s cheapest enemy, or only wounds it.',
    'A burst that does neither that nor control is a button with no felt moment.',
    '',
    swarmThresholdTable(content),
    '',
    '### Seconds to kill (single target, base kit, level 1, no upgrades)',
    '',
    ttkTable(content),
    '',
    END_MARKER
  ];
  return sections.join('\n');
}

/** Replaces the generated block in an existing doc, preserving the prose. */
export function spliceGeneratedBlock(doc: string, block: string): string {
  const start = doc.indexOf(BEGIN_MARKER);
  const end = doc.indexOf(END_MARKER);
  if (start < 0 || end < 0) {
    throw new Error(`docs/COMBAT.md is missing the ${BEGIN_MARKER} / ${END_MARKER} markers`);
  }
  return doc.slice(0, start) + block + doc.slice(end + END_MARKER.length);
}
