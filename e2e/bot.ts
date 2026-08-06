import type { Page } from '@playwright/test';
import { BROOD_WARRENS } from '../src/content/levels/broodWarrens';
import type { SimState } from '../src/sim/types';

/**
 * The Warrens bot, shared by the keyboard and gamepad playthroughs (#98).
 *
 * The bot decides in the sim's own vocabulary — a movement direction plus the
 * two action buttons — and each spec's driver turns that into real device
 * input. One brain, two devices: a gamepad run therefore proves the pad path,
 * not a second, easier bot.
 */

const TILE = BROOD_WARRENS.tileSize;

/** What the bot wants this poll, in the same shape as an `InputCommand`. */
export interface BotAction {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  attack: boolean;
  ability: boolean;
}

export function isWall(tx: number, ty: number): boolean {
  const row = BROOD_WARRENS.walls[ty];
  return row === undefined || row[tx] !== '.';
}

/** BFS shortest tile path; returns the next waypoint's world position. */
export function nextWaypoint(
  from: { x: number; y: number },
  to: { x: number; y: number }
): { x: number; y: number } | null {
  const start = { tx: Math.floor(from.x / TILE), ty: Math.floor(from.y / TILE) };
  const goal = { tx: Math.floor(to.x / TILE), ty: Math.floor(to.y / TILE) };
  if (start.tx === goal.tx && start.ty === goal.ty) return to;

  const w = BROOD_WARRENS.walls[0]!.length;
  const h = BROOD_WARRENS.walls.length;
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
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || isWall(nx, ny)) continue;
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
  return { x: (step % w) * TILE + TILE / 2, y: Math.floor(step / w) * TILE + TILE / 2 };
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
 * Plays The Brood Warrens: heal when hurt, break the spawners, then leave.
 * Holds the little state its decisions need (heal hysteresis, stuck counter)
 * across polls, so a spec only has to feed it `SimState` and drive the result.
 */
export class WarrensBot {
  private healMode = false;
  private prevPos = { x: -1, y: -1 };
  private stuckPolls = 0;
  /** Last decision's log line, for the failure dump. */
  readonly trace: string[] = [];

  constructor(private readonly playerSlot = 0) {}

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
    const targets = needHeal
      ? healSpots
      : state.generators.length > 0
        ? state.generators.map((g) => g.pos)
        : [state.exitPos];
    targets.sort(
      (a, b) => Math.hypot(a.x - me.pos.x, a.y - me.pos.y) - Math.hypot(b.x - me.pos.x, b.y - me.pos.y)
    );
    const target = targets[0]!;
    const distToTarget = Math.hypot(target.x - me.pos.x, target.y - me.pos.y);

    let moveX: -1 | 0 | 1 = 0;
    let moveY: -1 | 0 | 1 = 0;
    const inAttackRange = !needHeal && state.generators.length > 0 && distToTarget < 55;

    if (!inAttackRange) {
      const wp = nextWaypoint(me.pos, target) ?? target;
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
      // Face the generator so the melee arc connects.
      const dx = target.x - me.pos.x;
      const dy = target.y - me.pos.y;
      if (Math.abs(dx) > Math.abs(dy)) moveX = dx > 0 ? 1 : -1;
      else moveY = dy > 0 ? 1 : -1;
    }

    // Swing constantly; drop the Sunder Slam when swarmed.
    const nearbyEnemies = state.enemies.filter(
      (e) => Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y) < 100
    ).length;
    // Slam offensively when swarmed, or defensively when cornered at low HP.
    const touchingEnemies = state.enemies.filter(
      (e) => Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y) < 50
    ).length;
    const ability =
      (nearbyEnemies >= 2 || (me.hp <= 45 && touchingEnemies >= 1)) && me.abilityCooldown === 0;

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

    const action: BotAction = { moveX, moveY, attack: true, ability };
    this.trace.push(
      `t=${state.tick} hp=${Math.round(me.hp)} pos=${Math.round(me.pos.x)},${Math.round(me.pos.y)} ` +
        `gens=${state.generators.map((g) => Math.round(g.hp)).join('/') || '-'} enemies=${state.enemies.length} ` +
        `kills=${me.kills} heal=${this.healMode} move=${moveX},${moveY} slam=${ability}`
    );
    return action;
  }
}
