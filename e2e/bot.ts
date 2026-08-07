import type { Page } from '@playwright/test';
import { BROOD_WARRENS } from '../src/content/levels/broodWarrens';
import type { LevelDef, SimState } from '../src/sim/types';

/**
 * The Warrens bot, shared by the keyboard and gamepad playthroughs (#98).
 *
 * The bot decides in the sim's own vocabulary — a movement direction plus the
 * two action buttons — and each spec's driver turns that into real device
 * input. One brain, two devices: a gamepad run therefore proves the pad path,
 * not a second, easier bot.
 */

/**
 * The bot navigates whichever authored level it is pointed at. The Warrens stays
 * the default so the specs that predate multi-level runs read unchanged.
 */

/** What the bot wants this poll, in the same shape as an `InputCommand`. */
export interface BotAction {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  attack: boolean;
  ability: boolean;
}

export function isWall(tx: number, ty: number, level: LevelDef = BROOD_WARRENS): boolean {
  const row = level.walls[ty];
  return row === undefined || row[tx] !== '.';
}

/** BFS shortest tile path; returns the next waypoint's world position. */
export function nextWaypoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  level: LevelDef = BROOD_WARRENS
): { x: number; y: number } | null {
  const tile = level.tileSize;
  const start = { tx: Math.floor(from.x / tile), ty: Math.floor(from.y / tile) };
  const goal = { tx: Math.floor(to.x / tile), ty: Math.floor(to.y / tile) };
  if (start.tx === goal.tx && start.ty === goal.ty) return to;

  const w = level.walls[0]!.length;
  const h = level.walls.length;
  const key = (tx: number, ty: number) => ty * w + tx;
  const prev = new Map<number, number>();
  const queue = [key(start.tx, start.ty)];
  prev.set(queue[0]!, -1);
  let found = false;
  while (queue.length > 0 && !found) {
    const cur = queue.shift()!;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || isWall(nx, ny, level)) continue;
      const nk = key(nx, ny);
      if (prev.has(nk)) continue;
      prev.set(nk, cur);
      if (nx === goal.tx && ny === goal.ty) {
        found = true;
        break;
      }
      queue.push(nk);
    }
  }
  if (!found) return null;

  // Walk back from goal to the first step after start.
  let cur = key(goal.tx, goal.ty);
  let step = cur;
  while (prev.get(cur) !== -1) {
    step = cur;
    cur = prev.get(cur)!;
  }
  return { x: (step % w) * tile + tile / 2, y: Math.floor(step / w) * tile + tile / 2 };
}

export async function getState(page: Page): Promise<SimState> {
  return (await page.evaluate(() => {
    const hive = (globalThis as Record<string, unknown>).__hive as { getState: () => unknown } | undefined;
    return hive ? hive.getState() : null;
  })) as SimState;
}

export interface MissionPacingReport {
  elapsedMissionTicks: number;
  routeDistanceTiles: number | null;
  finalObjectiveToExitTiles: number | null;
  generatorClearOrder: string[];
  maxConcurrentEnemies: number;
}

/** Read-only completion/pacing report shared by authored-level regression specs. */
export async function getPacingReport(page: Page): Promise<MissionPacingReport> {
  return (await page.evaluate(() => {
    const hive = (globalThis as Record<string, unknown>).__hive as
      | { getMetrics: () => unknown }
      | undefined;
    return hive?.getMetrics() ?? null;
  })) as MissionPacingReport;
}

/** Turns a bot action into the keys the keyboard path listens for. */
export function actionToKeys(action: BotAction): string[] {
  const keys: string[] = [];
  if (action.moveX > 0) keys.push('ArrowRight');
  if (action.moveX < 0) keys.push('ArrowLeft');
  if (action.moveY > 0) keys.push('ArrowDown');
  if (action.moveY < 0) keys.push('ArrowUp');
  if (action.attack) keys.push('Space');
  if (action.ability) keys.push('Shift');
  return keys;
}

/**
 * Plays an authored mission: heal when hurt, break the spawners, then leave.
 * Holds the little state its decisions need (heal hysteresis, stuck counter)
 * across polls, so a spec only has to feed it `SimState` and drive the result.
 */
export class WarrensBot {
  private healMode = false;
  private prevPos = { x: -1, y: -1 };
  private stuckPolls = 0;
  /** Last decision's log line, for the failure dump. */
  readonly trace: string[] = [];

  constructor(
    private readonly playerSlot = 0,
    private readonly level: LevelDef = BROOD_WARRENS
  ) {}

  decide(state: SimState): BotAction {
    const me = state.players.find((player) => player.slot === this.playerSlot)!;

    // Survival first: break off and heal when hurt — from a health pickup or
    // by smashing an amber clutch (the bot swings constantly, so walking onto
    // the prop breaks it and the drop is collected on contact). Hysteresis
    // matters: without it the +30 heal lands right at the threshold and the
    // bot oscillates between distant heal spots until the swarm grinds it
    // down. Enter heal mode at <=55, stay in it until >=75 or spots run out.
    const healSpots = [
      ...state.pickups.filter((pk) => pk.kind === 'health').map((pk) => pk.pos),
      ...state.props.filter((pr) => pr.typeId === 'amber-clutch').map((pr) => pr.pos)
    ];
    // Exit only near full: a committed push to a node through the chasing
    // swarm costs 30-50 HP, so leaving heal mode at 75 just oscillates.
    if (this.healMode && (me.hp >= Math.min(100, me.maxHp) || healSpots.length === 0)) this.healMode = false;
    else if (!this.healMode && me.hp <= 55 && healSpots.length > 0) this.healMode = true;
    const needHeal = this.healMode;
    // A dormant spawner cannot be damaged, and one whose encounter still has
    // unmet dependencies cannot even be woken — walking at it just oscillates
    // forever. So: fight what is awake; failing that, go trip the trigger of
    // something that is actually ready. A linear map always has exactly one
    // ready stage, but a braid (#148) has two, and a *blocked* stage can be the
    // nearest thing on the map.
    const cleared = new Set(state.encounters.filter((e) => e.cleared).map((e) => e.id));
    const ready = new Set(
      (this.level.encounters ?? [])
        .filter((e) => (e.requires ?? []).every((dep) => cleared.has(dep)))
        .map((e) => e.id)
    );
    const live = state.generators.filter((g) => g.active);
    const wakeable = state.generators.filter((g) => g.encounterId === undefined || ready.has(g.encounterId));
    const spawners = live.length > 0 ? live : wakeable.length > 0 ? wakeable : state.generators;

    // A boss realm (issue #25) may have no spawners at all once its approach
    // is clear, or none left once the approach's spawners are down (#151).
    // An encounter-gated boss (`level.boss.encounterId`) starts dormant and
    // untargetable — walk to her threshold's trigger region to wake her
    // first, exactly like a wakeable-but-inactive spawner above.
    const boss = state.boss;
    const bossEncounterId = this.level.boss?.encounterId;
    const bossSpawn = this.level.boss
      ? { x: (this.level.boss.tx + 0.5) * this.level.tileSize, y: (this.level.boss.ty + 0.5) * this.level.tileSize }
      : null;
    let bossTarget: { x: number; y: number } | null = null;
    let distToBoss = Infinity;
    if (spawners.length === 0 && boss && boss.hp > 0) {
      distToBoss = Math.hypot(boss.pos.x - me.pos.x, boss.pos.y - me.pos.y);
      if (boss.active) {
        // Navigate toward her *authored* arena position, not her live one:
        // once awake she chases the player like any boss, and a fight that
        // starts right at the threshold would otherwise linger there —
        // outside the arena's own relief, cover and the dais it is staged
        // around, and outside the "her arena" identity #151 preserves.
        bossTarget = bossSpawn ?? boss.pos;
      } else if (bossEncounterId) {
        const trigger = (this.level.encounters ?? []).find((e) => e.id === bossEncounterId)?.trigger;
        if (trigger?.kind === 'region') {
          bossTarget = {
            x: ((trigger.minTx + trigger.maxTx + 1) / 2) * this.level.tileSize,
            y: ((trigger.minTy + trigger.maxTy + 1) / 2) * this.level.tileSize
          };
        } else if (trigger?.kind === 'radius') {
          bossTarget = { x: (trigger.tx + 0.5) * this.level.tileSize, y: (trigger.ty + 0.5) * this.level.tileSize };
        }
      } else {
        bossTarget = bossSpawn ?? boss.pos;
      }
    }
    // Whether she can actually be fought right now — independent of the
    // *navigation* target above, which may be her arena position rather than
    // her current one.
    const bossInAttackRange = !!boss && boss.hp > 0 && boss.active && distToBoss < 120;

    const targets = needHeal
      ? healSpots
      : spawners.length > 0
        ? spawners.map((g) => g.pos)
        : bossTarget
          ? [bossTarget]
          : [state.exitPos];
    targets.sort(
      (a, b) => Math.hypot(a.x - me.pos.x, a.y - me.pos.y) - Math.hypot(b.x - me.pos.x, b.y - me.pos.y)
    );
    const target = targets[0]!;
    const distToTarget = Math.hypot(target.x - me.pos.x, target.y - me.pos.y);
    // What to face and swing at: the boss's live position once she's in
    // range, regardless of where the bot is currently *navigating* to.
    const faceTarget = bossInAttackRange && boss ? boss.pos : target;

    let moveX: -1 | 0 | 1 = 0;
    let moveY: -1 | 0 | 1 = 0;
    // A boss silhouette is much larger than a generator's, so collision stops
    // the hero well outside the generic 55px threshold; a bigger reach keeps
    // the bot facing and swinging instead of endlessly re-pathing.
    const inAttackRange = !needHeal && ((spawners.length > 0 && distToTarget < 55) || bossInAttackRange);

    // "The dodge window is the telegraph" (docs/COMBAT.md): a boss holds
    // still before every attack, then commits — a lunge keeps dealing contact
    // damage for the whole dash, past the telegraph that announced it. A
    // spawner never telegraphs like this, so this only applies while actually
    // fighting an active boss. Sidestep rather than tanking a hit the tell
    // gave plenty of warning for.
    const bossDodging = bossInAttackRange && boss && (boss.telegraphTicksLeft > 0 || boss.chargeTicksLeft > 0);
    if (bossDodging && boss) {
      const dx = boss.pos.x - me.pos.x;
      const dy = boss.pos.y - me.pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      // Perpendicular to the boss direction, biased by tick parity so the
      // bot doesn't dither in place when exactly on-axis.
      const tangentX = -dy / dist;
      const tangentY = dx / dist;
      moveX = (tangentX > 0.1 ? 1 : tangentX < -0.1 ? -1 : state.tick % 2 === 0 ? 1 : -1) as -1 | 0 | 1;
      moveY = (tangentY > 0.1 ? 1 : tangentY < -0.1 ? -1 : state.tick % 2 === 0 ? -1 : 1) as -1 | 0 | 1;
    } else if (!inAttackRange) {
      const wp = nextWaypoint(me.pos, target, this.level) ?? target;
      const dx = wp.x - me.pos.x;
      const dy = wp.y - me.pos.y;
      // Tolerance must stay under (tileSize/2 - heroRadius) = 4, or the bot
      // can clip a wall corner by a pixel and deadlock on axis-separated
      // collision (it never presses the perpendicular key to slide free).
      if (dx > 3) moveX = 1;
      if (dx < -3) moveX = -1;
      if (dy > 3) moveY = 1;
      if (dy < -3) moveY = -1;
    } else {
      // Face the generator (or the boss) so the melee arc connects.
      const dx = faceTarget.x - me.pos.x;
      const dy = faceTarget.y - me.pos.y;
      if (Math.abs(dx) > Math.abs(dy)) moveX = dx > 0 ? 1 : -1;
      else moveY = dy > 0 ? 1 : -1;
    }

    // Swing constantly; drop the Sunder Slam when swarmed. The one exception
    // is a boss telegraph dodge: nothing is in range to hit during the sidestep
    // anyway, and holding the swing there (rather than reflexively holding it
    // through a wide evasive maneuver) cuts down on incidentally shattering an
    // Amber Clutch — health meant for the fight — while just repositioning.
    const nearbyEnemies = state.enemies.filter(
      (e) => Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y) < 100
    ).length;
    // Slam offensively when swarmed, or defensively when cornered at low HP.
    const touchingEnemies = state.enemies.filter(
      (e) => Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y) < 50
    ).length;
    const ability =
      (nearbyEnemies >= 2 || (me.hp <= 45 && touchingEnemies >= 1)) && me.abilityCooldown === 0;
    const attack = !bossDodging;

    // Stuck insurance: if we're holding a direction but not moving, jiggle
    // perpendicular to slide off whatever geometry has us pinned.
    const moving = moveX !== 0 || moveY !== 0;
    if (moving && Math.abs(me.pos.x - this.prevPos.x) < 1 && Math.abs(me.pos.y - this.prevPos.y) < 1) {
      this.stuckPolls++;
    } else {
      this.stuckPolls = 0;
    }
    this.prevPos = { x: me.pos.x, y: me.pos.y };
    if (this.stuckPolls >= 6) {
      const horizontal = moveX !== 0;
      const early = this.stuckPolls % 8 < 4;
      if (horizontal) {
        if (moveY === 0) moveY = early ? -1 : 1;
      } else if (moveX === 0) {
        moveX = early ? -1 : 1;
      }
    }

    const action: BotAction = { moveX, moveY, attack, ability };
    this.trace.push(
      `t=${state.tick} hp=${Math.round(me.hp)} pos=${Math.round(me.pos.x)},${Math.round(me.pos.y)} ` +
        `gens=${state.generators.map((g) => Math.round(g.hp)).join('/') || '-'} enemies=${state.enemies.length} ` +
        `kills=${me.kills} heal=${this.healMode} healSpots=${healSpots.length} boss=${boss ? `${Math.round(boss.pos.x)},${Math.round(boss.pos.y)},act${boss.active ? 1 : 0},tel${boss.telegraphTicksLeft},chg${boss.chargeTicksLeft}` : '-'} ` +
        `dist=${Math.round(distToTarget)} inRange=${inAttackRange} nearby=${nearbyEnemies} atk=${attack} tgt=${Math.round(target.x)},${Math.round(target.y)} ` +
        `move=${moveX},${moveY} slam=${ability}`
    );
    return action;
  }
}
