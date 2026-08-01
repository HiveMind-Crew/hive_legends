import { TICK_RATE } from '../src/sim/types';
import type { AttackDef, BossActionDef, BossDef, ContentDb, EnemyDef, GeneratorDef, HeroDef, WeaponDef } from '../src/sim/types';
import { benchmarkMireveilRoster, MIREVEIL_BENCHMARK_SEED } from './mireveilBenchmark';

/**
 * Derives every combat table in docs/COMBAT.md from src/content, so the
 * numbers a reviewer reads can never drift from the numbers the sim runs.
 *
 * Nothing here is authored: the prose in COMBAT.md states the *intent*, this
 * file computes the *consequences*. `tests/combatDoc.test.ts` fails the build
 * when the checked-in block no longer matches this output.
 */

/**
 * A doc holds one generated region per name, fenced by these markers. Keeping
 * the name a parameter is what lets COMBAT.md carry the hero tables and the
 * bestiary as two independently spliced blocks with prose in between.
 */
export function markersFor(region: string): { begin: string; end: string } {
  return { begin: `<!-- BEGIN GENERATED: ${region} -->`, end: `<!-- END GENERATED: ${region} -->` };
}

export const COMBAT_REGION = 'combat-tables';
export const BESTIARY_REGION = 'bestiary-tables';

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

/**
 * Sustained single-target damage per second at the enemy's own cadence. The
 * complete repeated cycle includes both its committed windup and recovery.
 */
export function enemyDps(def: EnemyDef): number {
  return (def.attack.damage * TICK_RATE) / (def.attack.cooldownTicks + def.attack.windupTicks);
}

/**
 * Seconds a player has to read a telegraph and leave. Every enemy attack —
 * including the first contact — waits out `attack.windupTicks` while the enemy
 * holds still, so this is the whole of the counterplay against one.
 */
export function dodgeWindow(def: EnemyDef): number {
  return def.attack.windupTicks / TICK_RATE;
}

/** How an enemy delivers its damage, in one cell. */
export function enemyAttackKind(def: EnemyDef): EnemyDef['attack']['kind'] {
  return def.attack.kind;
}

export function enemyShape(def: EnemyDef): string {
  const attack = def.attack;
  if (attack.kind === 'bolt') return `bolt ${attack.projectileSpeed} px/s, ${attack.projectileRange} px`;
  if (attack.kind === 'volley') {
    return `volley ${attack.count}× / ${attack.spreadDeg}°, ${attack.projectileSpeed} px/s`;
  }
  if (attack.kind === 'line') {
    return `line ${attack.length}×${attack.width} px, push ${attack.pushPx} px`;
  }
  if (attack.kind === 'pounce') return `pounce ${attack.distance}×${attack.width} px`;
  return attack.pushPx > 0
    ? `contact ${attack.arcDeg}° arc, push ${attack.pushPx} px`
    : `contact ${attack.arcDeg}° arc`;
}

/**
 * The comparator `throughputTable` uses, lifted out so the axis-leader table
 * and `tests/combat.test.ts` rank crowd reach the same way. Coarse by
 * construction: pierce count for bolts, swept area per 1000 px² for arcs.
 */
export function crowdScore(atk: AttackDef): number {
  const targets = targetsPerUse(atk);
  return targets !== null ? dps(atk) * targets : dps(atk) * ((sweptArea(atk) ?? 0) / 1000);
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

/**
 * Who leads each core axis, and by how much. `tests/combat.test.ts` asserts the
 * specific archetype lines (the Sentinel is toughest, the Ranger fastest); this
 * table exists for the question a test cannot answer — whether a hero leads
 * anything at all.
 */
function axisLeaderTable(content: ContentDb): string {
  const heroes = heroList(content);
  const axes: { name: string; of: (h: HeroDef) => number; fmt: (v: number) => string }[] = [
    { name: 'Max HP', of: (h) => h.maxHp, fmt: (v) => String(v) },
    { name: 'Move speed', of: (h) => h.moveSpeed, fmt: (v) => String(v) },
    { name: 'Reach', of: (h) => h.attack.range, fmt: (v) => `${v} px` },
    { name: 'Single-target DPS', of: (h) => dps(h.attack), fmt: n1 },
    { name: 'Crowd score', of: (h) => crowdScore(h.attack), fmt: n1 },
    { name: 'Knockback', of: (h) => h.attack.knockback, fmt: (v) => String(v) }
  ];
  const rows = axes.map((axis) => {
    const scored = heroes.map((h) => ({ hero: h, v: axis.of(h) })).sort((a, b) => b.v - a.v);
    const best = scored[0]!.v;
    const leaders = scored.filter((s) => s.v === best);
    const next = scored.find((s) => s.v < best);
    return [
      axis.name,
      leaders.map((s) => s.hero.role).join(' + ') + (leaders.length > 1 ? ' (tied)' : ''),
      axis.fmt(best),
      next ? `+${axis.fmt(best - next.v)} over ${next.hero.role}` : '—'
    ];
  });
  // A hero absent from every leader cell owns no axis of its own.
  const leading = new Set(rows.flatMap((r) => r[1]!.replace(' (tied)', '').split(' + ')));
  const orphans = heroes.filter((h) => !leading.has(h.role)).map((h) => h.role);
  const note =
    orphans.length === 0
      ? 'Every hero leads at least one axis.'
      : `**Leads nothing: ${orphans.join(', ')}.** A hero with no axis of its own is the shape convergence takes.`;
  return `${table(['Axis', 'Leader', 'Value', 'Margin'], rows)}\n\n${note}`;
}

// ---------------------------------------------------------------------------
// Bestiary — enemies, their spawners, and the boss
// ---------------------------------------------------------------------------

function enemyList(content: ContentDb): EnemyDef[] {
  return Object.values(content.enemies);
}

function bestiaryTable(content: ContentDb): string {
  const rows = enemyList(content).map((e) => [
    e.name,
    e.family,
    e.tier,
    String(e.maxHp),
    String(e.moveSpeed),
    `${e.attack.range} px`,
    String(e.attack.damage),
    `${e.attack.cooldownTicks}t`,
    `${e.attack.windupTicks}t`,
    n1(enemyDps(e)),
    e.keepDistanceFraction ? `yes (${e.keepDistanceFraction})` : 'no',
    `${e.goldMin}–${e.goldMax}`,
    String(e.xp)
  ]);
  return table(
    ['Enemy', 'Family', 'Tier', 'HP', 'Speed', 'Reach', 'Dmg', 'Recovery', 'Windup', 'DPS', 'Kites', 'Gold', 'XP'],
    rows
  );
}

/** Enemy output measured against what it is shooting at: the heroes. */
function threatTable(content: ContentDb): string {
  const heroes = heroList(content);
  const rows = enemyList(content).map((e) => [
    e.name,
    enemyShape(e),
    n1(enemyDps(e)),
    `${dodgeWindow(e).toFixed(2)} s`,
    ...heroes.map((h) => n1(h.maxHp / enemyDps(e)))
  ]);
  return table(['Enemy', 'Shape', 'DPS', 'Dodge window', ...heroes.map((h) => `vs ${h.role}`)], rows);
}

function spawnerTable(content: ContentDb): string {
  const gens = Object.values(content.generators) as GeneratorDef[];
  const rows = gens.map((g) => [
    g.name,
    String(g.maxHp),
    content.enemies[g.spawnsEnemyId]?.name ?? g.spawnsEnemyId,
    `${g.spawnIntervalTicks}t`,
    `${g.maxAlive} / +${g.maxAlivePerExtraPlayer ?? 0}`,
    g.enrage ? `≤${pct(g.enrage.hpFraction)} hp → ×${g.enrage.intervalMult} for ${secs(g.enrage.durationTicks)}` : '—',
    g.onDeathSpawn ? (content.enemies[g.onDeathSpawn.enemyId]?.name ?? g.onDeathSpawn.enemyId) : '—',
    String(g.goldDrop),
    String(g.xp)
  ]);
  return table(['Spawner', 'HP', 'Spawns', 'Interval', 'Max alive solo / +hero', 'Enrage', 'On death', 'Gold', 'XP'], rows);
}

function bossPhaseTable(boss: BossDef): string {
  const rows = boss.phases.map((p, i) => [
    `${i + 1}`,
    p.name,
    `≤${pct(p.hpFraction)}`,
    String(p.moveSpeed),
    secs(p.actionIntervalTicks),
    p.actions.map((action) => action.id).join(' → ')
  ]);
  return table(['Phase', 'Name', 'HP', 'Speed', 'Action interval', 'Action cycle'], rows);
}

function bossActionTable(boss: BossDef): string {
  const actions = new Map<string, BossActionDef>();
  for (const phase of boss.phases) {
    for (const action of phase.actions) actions.set(action.id, action);
  }
  const rows = [...actions.values()].map((action) => [action.id, bossActionDescription(action), action.tell]);
  return table(['Action', 'What it does', 'Telegraph'], rows);
}

function bossActionDescription(action: BossActionDef): string {
  if (action.kind === 'summon') return `summons ${action.count}× ${action.enemyId}`;
  if (action.kind === 'charge') {
    return `${action.speed} px/s for ${secs(action.durationTicks)}, ${action.damage} damage on contact`;
  }
  return (
    `${action.count} bolts across ${action.spreadDeg}°, ` +
    `${action.projectileDamage} damage @ ${action.projectileSpeed} px/s, ${action.projectileRange} px`
  );
}

function mireveilBenchmarkTable(content: ContentDb): string {
  const rows = benchmarkMireveilRoster(content).map((result) => [
    result.role,
    String(result.ticks),
    `${result.seconds.toFixed(2)} s`
  ]);
  return table(['Hero', 'Ticks', 'TTK'], rows);
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** The full generated markdown block, marker lines included. */
export function renderCombatTables(content: ContentDb): string {
  const hitstun = content.combat.enemyHitstunTicks;
  const marker = markersFor(COMBAT_REGION);
  const sections = [
    marker.begin,
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
    '### Axis leaders',
    '',
    'Who is strictly best on each core axis, at base kit. A hero leading nothing is not a',
    'failing test — it is a hero with no axis of its own, which is how two characters start',
    'to feel like one. Ties are listed together, and a tie is its own warning.',
    '',
    axisLeaderTable(content),
    '',
    marker.end
  ];
  return sections.join('\n');
}

/** The generated bestiary block — enemies, spawners and every boss. */
export function renderBestiaryTables(content: ContentDb): string {
  const marker = markersFor(BESTIARY_REGION);
  const sections = [
    marker.begin,
    '',
    '<!-- Do not edit by hand. Regenerate with `npm run docs:combat`. -->',
    '',
    '### The roster',
    '',
    'Reach is the distance at which the enemy commits to an attack — for a ranged enemy that is',
    'where it stops and fires, not how far the bolt flies. Every enemy authors shape, damage,',
    'commit range, windup, and recovery together in one discriminated `attack` definition.',
    `Enemy DPS is \`damage × ${TICK_RATE} / (cooldownTicks + windupTicks)\`: a full repeated attack`,
    'cycle includes both the committed telegraph and the recovery before the next windup.',
    '',
    bestiaryTable(content),
    '',
    '### Threat and readability',
    '',
    'The dodge window is the telegraph: the enemy holds still for that long before every attack,',
    'so it is the whole of the counterplay. The `vs` columns are seconds of unanswered attacks to',
    'drop each hero from full — the pressure a single one of these represents, before the swarm.',
    '',
    threatTable(content),
    '',
    '### Where they come from',
    '',
    spawnerTable(content),
    '',
    ...Object.values(content.bosses).flatMap((boss) => [
      `### ${boss.name} — ${boss.title}`,
      '',
      `${boss.maxHp} hp · radius ${boss.radius} px · ${boss.touchDamage} contact damage every ` +
        `${secs(boss.touchCooldownTicks)} · ${secs(boss.telegraphTicks)} telegraph · ` +
        `${boss.goldDrop}g and ${boss.xp} xp on death.`,
      '',
      bossPhaseTable(boss),
      '',
      'Phases are entered on HP thresholds and never left. Actions run as a strict round-robin',
      'over the cycle above — no randomness — each preceded by the full telegraph.',
      '',
      bossActionTable(boss),
      '',
      ...(boss.id === 'mireveil'
        ? [
            '#### Scripted base-kit time to kill',
            '',
            `Fixed seed ${MIREVEIL_BENCHMARK_SEED}; level 1, tier-1 built-in weapon, no upgrades, room loot, or potions.`,
            'One shared input script approaches through normal collision, attacks only in authored reach,',
            'uses each kit’s ability in its intended geometry, circles during recovery, and sidesteps charges.',
            '',
            mireveilBenchmarkTable(content),
            ''
          ]
        : [])
    ]),
    marker.end
  ];
  return sections.join('\n');
}

/** Replaces one named generated region in an existing doc, preserving the prose. */
export function spliceGeneratedBlock(doc: string, block: string, region: string): string {
  const { begin, end } = markersFor(region);
  const start = doc.indexOf(begin);
  const stop = doc.indexOf(end);
  if (start < 0 || stop < 0) {
    throw new Error(`docs/COMBAT.md is missing the ${begin} / ${end} markers`);
  }
  if (stop < start) {
    throw new Error(`docs/COMBAT.md has ${end} before ${begin}`);
  }
  return doc.slice(0, start) + block + doc.slice(stop + end.length);
}
