import { expect, test, type Page } from '@playwright/test';
import { BROOD_WARRENS } from '../src/content/levels/broodWarrens';
import { PROGRESSION } from '../src/content/progression';
import { levelForXp } from '../src/sim/sim';
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
  // A settle for the screenshot only — correctness must not depend on it, see
  // the retry below.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/01-hero-select.png' });

  // Hero select hands off to the wheel, which deploys (issue #57), so reaching
  // a mission now takes two confirms rather than one.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/01b-mission-hub.png' });

  // Confirm through to the mission, retrying the press rather than sending it
  // once (issue #61). The canvas turns visible as soon as Phaser creates it,
  // but BootScene then generates every texture procedurally before
  // HeroSelectScene exists to bind `keydown-ENTER`. On a loaded machine that
  // outlasts any fixed wait, and a single press is silently swallowed — the
  // test then times out on a keypress that never landed, which no amount of
  // extra polling can recover.
  //
  // The retry also covers the extra hop: if the press above was dropped, this
  // loop walks hero select → wheel → mission on its own. Safe at every step —
  // the wheel deploys the node its cursor already sits on (`suggestedNode`, so
  // The Brood Warrens on a fresh profile), and once a mission is running
  // MissionScene ignores Enter entirely (it binds only `M` and `F`).
  await expect
    .poll(
      async () => {
        if ((await getState(page)) !== null) return true;
        await page.keyboard.press('Enter');
        return false;
      },
      { timeout: 20_000, intervals: [250] }
    )
    .toBe(true);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/02-mission-start.png' });

  const driver = new KeyDriver(page);
  const deadline = Date.now() + 180_000;
  let lastPhase = 'combat';
  let screenshotTaken = false;
  let juiceShotTaken = false;
  let damagedNodeShotTaken = false;
  let healMode = false;
  let prevPos = { x: -1, y: -1 };
  let stuckPolls = 0;
  const trace: string[] = [];

  while (Date.now() < deadline) {
    const state = await getState(page);
    if (!state) break;
    lastPhase = state.phase;
    if (state.phase === 'complete' || state.phase === 'failed') break;

    const me = state.players[0]!;

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
    if (healMode && (me.hp >= Math.min(100, me.maxHp) || healSpots.length === 0)) healMode = false;
    else if (!healMode && me.hp <= 55 && healSpots.length > 0) healMode = true;
    const needHeal = healMode;
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

    const keys: string[] = [];
    const inAttackRange = !needHeal && state.generators.length > 0 && distToTarget < 55;

    if (!inAttackRange) {
      const wp = nextWaypoint(me.pos, target) ?? target;
      const dx = wp.x - me.pos.x;
      const dy = wp.y - me.pos.y;
      // Tolerance must stay under (tileSize/2 - heroRadius) = 4, or the bot
      // can clip a wall corner by a pixel and deadlock on axis-separated
      // collision (it never presses the perpendicular key to slide free).
      if (dx > 3) keys.push('ArrowRight');
      if (dx < -3) keys.push('ArrowLeft');
      if (dy > 3) keys.push('ArrowDown');
      if (dy < -3) keys.push('ArrowUp');
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
    // Slam offensively when swarmed, or defensively when cornered at low HP.
    const touchingEnemies = state.enemies.filter(
      (e) => Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y) < 50
    ).length;
    if ((nearbyEnemies >= 2 || (me.hp <= 45 && touchingEnemies >= 1)) && me.abilityCooldown === 0) {
      keys.push('Shift');
    }

    // Stuck insurance: if we're holding movement keys but not moving, jiggle
    // perpendicular to slide off whatever geometry has us pinned.
    const moving = keys.some((k) => k.startsWith('Arrow'));
    if (moving && Math.abs(me.pos.x - prevPos.x) < 1 && Math.abs(me.pos.y - prevPos.y) < 1) stuckPolls++;
    else stuckPolls = 0;
    prevPos = { x: me.pos.x, y: me.pos.y };
    if (stuckPolls >= 6) {
      const horizontal = keys.includes('ArrowLeft') || keys.includes('ArrowRight');
      const jiggle = horizontal
        ? stuckPolls % 8 < 4
          ? 'ArrowUp'
          : 'ArrowDown'
        : stuckPolls % 8 < 4
          ? 'ArrowLeft'
          : 'ArrowRight';
      if (!keys.includes(jiggle)) keys.push(jiggle);
    }

    trace.push(
      `t=${state.tick} hp=${Math.round(me.hp)} pos=${Math.round(me.pos.x)},${Math.round(me.pos.y)} ` +
        `gens=${state.generators.map((g) => Math.round(g.hp)).join('/') || '-'} enemies=${state.enemies.length} ` +
        `kills=${me.kills} heal=${healMode} keys=${keys.join('+')}`
    );

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
    // Capture a heavily damaged (crumbling-tier) generator for the damage-state
    // comparison against 02-mission-start's intact nodes.
    if (!damagedNodeShotTaken && state.generators.some((g) => g.hp / g.maxHp < 0.34)) {
      await page.screenshot({ path: 'test-results/03c-node-damaged.png' });
      damagedNodeShotTaken = true;
    }
    await page.waitForTimeout(90);
  }
  await driver.releaseAll();

  // On failure, dump the bot's recent decisions so flakes diagnose themselves.
  if (lastPhase !== 'complete') {
    console.log(`--- bot trace (last 80 of ${trace.length} polls) ---`);
    for (const line of trace.slice(-80)) console.log(line);
  }
  expect(lastPhase).toBe('complete');
  // The end-of-mission banner shows first; poll until the results scene has
  // banked the run to the persistent profile rather than sleeping a fixed time.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('hive-legends-profile-v1')), { timeout: 10_000 })
    .not.toBeNull();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/04-results.png' });

  const profile = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null')
  );
  expect(profile).not.toBeNull();
  expect(profile.missionsCompleted).toBeGreaterThanOrEqual(1);
  expect(profile.bank).toBeGreaterThan(0);
  // The run's kills and destroyed spawners banked XP too (issue #46).
  expect(profile.xp).toBeGreaterThan(0);

  // Buy a persistent upgrade in the results shop (Hearthstone Vigor, 80g).
  const bank: number = profile.bank;
  if (bank >= 80) {
    await page.keyboard.press('1');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null')
    );
    expect(after.upgrades.vitality).toBe(1);
    expect(after.bank).toBe(bank - 80);
  }

  // Replay: the hero must keep the purchased power (+20 max HP per vitality
  // rank) *and* the level earned from the run's XP (+maxHpPerLevel each).
  await page.keyboard.press('R');
  // The pre-replay handle still reports phase 'complete'; wait for the fresh sim.
  await expect
    .poll(async () => (await getState(page))?.phase, { timeout: 10_000 })
    .toBe('combat');
  const replayState = await getState(page);
  const vitality = bank >= 80 ? 1 : 0;
  const heroLevel = levelForXp(PROGRESSION, profile.xp);
  const levelHp = (heroLevel - 1) * PROGRESSION.maxHpPerLevel;
  expect(replayState.players[0]!.level).toBe(heroLevel);
  expect(replayState.players[0]!.maxHp).toBe(120 + 20 * vitality + levelHp);
  await page.screenshot({ path: 'test-results/05-replay-upgraded.png' });

  const fatal = consoleErrors.filter((e) => !e.includes('favicon'));
  expect(fatal).toEqual([]);
});

test('The Resin Galleries loads its dedicated amber-resin environment pack', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.addInitScript(() => {
    localStorage.setItem(
      'hive-legends-profile-v1',
      JSON.stringify({
        bank: 0,
        upgrades: {},
        missionsCompleted: 1,
        bestClearTicks: null,
        unlockedHeroes: [],
        clearedLevels: ['brood-warrens'],
        weapons: {},
        xp: 0,
        volume: 0.7,
        muted: true
      })
    );
  });

  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  // Boot can keep generating textures after the canvas appears. Retry Enter
  // through hero select and the wheel until the mission's state exists,
  // matching the resilient startup flow used by the full playthrough above.
  await expect
    .poll(
      async () => {
        const state = await getState(page);
        if (state !== null) return state.generators.length;
        await page.keyboard.press('Enter');
        return undefined;
      },
      { timeout: 20_000, intervals: [250] }
    )
    .toBe(3);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/02b-resin-galleries-art.png' });

  const fatal = consoleErrors.filter((error) => !error.includes('favicon'));
  expect(fatal).toEqual([]);
});
