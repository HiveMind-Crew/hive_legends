import { expect, test, type Page } from '@playwright/test';
import { BROOD_WARRENS } from '../src/content/levels/broodWarrens';
import type { SimState } from '../src/sim/types';

/**
 * Full gameplay verification: a bot plays the mission through the real
 * input path (keyboard events), navigating with BFS over the level's wall
 * grid, destroying both Brood Nodes, and walking to the exit. Asserts the
 * mission completes and progression is banked to localStorage.
 */

const TILE = BROOD_WARRENS.tileSize;

function isWall(tx: number, ty: number): boolean {
  const row = BROOD_WARRENS.walls[ty];
  return row === undefined || row[tx] !== '.';
}

/** BFS shortest tile path; returns the next waypoint's world position. */
function nextWaypoint(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } | null {
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

async function getState(page: Page): Promise<SimState> {
  return (await page.evaluate(() => {
    const hive = (globalThis as Record<string, unknown>).__hive as
      | { getState: () => unknown }
      | undefined;
    return hive ? hive.getState() : null;
  })) as SimState;
}

class KeyDriver {
  private held = new Set<string>();
  constructor(private page: Page) {}

  async set(keys: string[]): Promise<void> {
    const want = new Set(keys);
    for (const k of [...this.held]) {
      if (!want.has(k)) {
        await this.page.keyboard.up(k);
        this.held.delete(k);
      }
    }
    for (const k of want) {
      if (!this.held.has(k)) {
        await this.page.keyboard.down(k);
        this.held.add(k);
      }
    }
  }

  async releaseAll(): Promise<void> {
    await this.set([]);
  }
}

test('a player can complete The Brood Warrens and bank progression', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/01-hero-select.png' });

  // Enter the mission from hero select.
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await getState(page)) !== null, { timeout: 10_000 })
    .toBe(true);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/02-mission-start.png' });

  const driver = new KeyDriver(page);
  const deadline = Date.now() + 180_000;
  let lastPhase = 'combat';
  let screenshotTaken = false;
  let juiceShotTaken = false;

  while (Date.now() < deadline) {
    const state = await getState(page);
    if (!state) break;
    lastPhase = state.phase;
    if (state.phase === 'complete' || state.phase === 'failed') break;

    const me = state.players[0]!;

    // Target: nearest generator while any remain, then the exit.
    const targets = state.generators.length > 0 ? state.generators.map((g) => g.pos) : [state.exitPos];
    targets.sort(
      (a, b) => Math.hypot(a.x - me.pos.x, a.y - me.pos.y) - Math.hypot(b.x - me.pos.x, b.y - me.pos.y)
    );
    const target = targets[0]!;
    const distToTarget = Math.hypot(target.x - me.pos.x, target.y - me.pos.y);

    const keys: string[] = [];
    const inAttackRange = state.generators.length > 0 && distToTarget < 55;

    if (!inAttackRange) {
      const wp = nextWaypoint(me.pos, target) ?? target;
      const dx = wp.x - me.pos.x;
      const dy = wp.y - me.pos.y;
      if (dx > 6) keys.push('ArrowRight');
      if (dx < -6) keys.push('ArrowLeft');
      if (dy > 6) keys.push('ArrowDown');
      if (dy < -6) keys.push('ArrowUp');
    } else {
      // Face the generator so the melee arc connects.
      const dx = target.x - me.pos.x;
      const dy = target.y - me.pos.y;
      if (Math.abs(dx) > Math.abs(dy)) keys.push(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
      else keys.push(dy > 0 ? 'ArrowDown' : 'ArrowUp');
    }

    // Swing constantly; drop the Sunder Slam when swarmed.
    keys.push('Space');
    const nearbyEnemies = state.enemies.filter(
      (e) => Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y) < 100
    ).length;
    if (nearbyEnemies >= 3 && me.abilityCooldown === 0) keys.push('Shift');

    await driver.set(keys);

    if (!screenshotTaken && state.enemies.length >= 4) {
      await page.screenshot({ path: 'test-results/03-horde-combat.png' });
      screenshotTaken = true;
    }
    // Capture the combat feedback (damage numbers, particles) right after
    // the first kill lands.
    if (!juiceShotTaken && me.kills > 0) {
      await page.screenshot({ path: 'test-results/03b-combat-juice.png' });
      juiceShotTaken = true;
    }
    await page.waitForTimeout(90);
  }
  await driver.releaseAll();

  expect(lastPhase).toBe('complete');
  await page.waitForTimeout(1200); // results transition
  await page.screenshot({ path: 'test-results/04-results.png' });

  // Progression must be banked to the persistent profile.
  const profile = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null')
  );
  expect(profile).not.toBeNull();
  expect(profile.missionsCompleted).toBeGreaterThanOrEqual(1);
  expect(profile.bank).toBeGreaterThan(0);

  // Buy a persistent upgrade in the results shop (Hearthstone Vigor, 50g).
  const bank: number = profile.bank;
  if (bank >= 50) {
    await page.keyboard.press('1');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null')
    );
    expect(after.upgrades.vitality).toBe(1);
    expect(after.bank).toBe(bank - 50);
  }

  // Replay: hero must keep the purchased power (+20 max HP per vitality rank).
  await page.keyboard.press('R');
  // The pre-replay handle still reports phase 'complete'; wait for the fresh sim.
  await expect
    .poll(async () => (await getState(page))?.phase, { timeout: 10_000 })
    .toBe('combat');
  const replayState = await getState(page);
  const vitality = bank >= 50 ? 1 : 0;
  expect(replayState.players[0]!.maxHp).toBe(120 + 20 * vitality);
  await page.screenshot({ path: 'test-results/05-replay-upgraded.png' });

  const fatal = consoleErrors.filter((e) => !e.includes('favicon'));
  expect(fatal).toEqual([]);
});
