import { expect, test, type Page } from '@playwright/test';
import { HOLLOW_THRONE } from '../src/content/levels/hollowThrone';
import { actionToKeys, getPacingReport, getState, WarrensBot } from './bot';

/**
 * The Hollow Throne's staged pre-boss approach (#151), played by the same bot
 * brain as every other mission through the same keyboard path.
 *
 * What this proves that a unit test cannot: the two sanctums are actually
 * navigable in whichever order the bot picks, Mireveil stays untouched and
 * inert until both clear and the threshold is crossed, and a real run stays
 * under the hostile ceiling through the whole approach *and* the fight. The
 * unit tests (tests/sim/hollowThrone.test.ts) pin the budgets; this pins that
 * the geometry — and the boss dormancy wiring — is actually playable.
 */

const PROFILE_KEY = 'hive-legends-profile-v1';
/** The readability ceiling from docs/design/visual-direction.md. */
const HOSTILE_CEILING = 15;

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

test('a player can clear both sanctums in either order and fell a dormant-until-woken Mireveil', async ({ page }) => {
  // A boss fight fought by a blunt "always swing" bot, plus any arcade
  // continues it needs, runs meaningfully longer than a swarm mission.
  test.setTimeout(300_000);
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  // The Hollow Throne is the realm boss node, so seed the three mission
  // clears that unlock it. Everything about unlocking derives from
  // `clearedLevels` (docs/PROGRESSION.md). A real party reaching the realm
  // finale has banked gold from three missions' worth of loot and bounties;
  // seed enough `bank` to afford a few arcade continues (issue #99) if this
  // bot's blunt "always swing" combat brain — not a boss-optimized dueler —
  // falls to her, exactly like a human's mistimed attempt would.
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: PROFILE_KEY,
      value: { clearedLevels: ['brood-warrens', 'resin-galleries', 'cobalt-combs'], bank: 2000 }
    }
  );
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('canvas') !== null);
  await page.waitForTimeout(2000);

  // Hero select -> hub, then walk the hub cursor onto the boss node and deploy.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    const entered = await page.evaluate(
      () => (globalThis as Record<string, unknown>).__hive !== undefined
    );
    if (entered) break;
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
  }

  let state = await getState(page);
  expect(state, 'the bot never reached the mission').not.toBeNull();
  expect(state.generators).toHaveLength(HOLLOW_THRONE.generators.length);
  // Every stage — both sanctums, and the boss herself — starts dormant.
  expect(state.generators.filter((generator) => generator.active)).toHaveLength(0);
  expect(state.boss?.active).toBe(false);
  await page.screenshot({ path: 'test-results/151-01-throne-start.png' });

  const bot = new WarrensBot(0, HOLLOW_THRONE);
  const driver = new KeyDriver(page);
  const activationOrder: string[] = [];
  let maxConcurrentEnemies = 0;
  let sawBossActive = false;
  let continuesTaken = 0;
  let continuePressed = false;

  // One combat loop covers the whole run: clearing both sanctums, crossing
  // the threshold, and the fight itself — the sim only leaves 'combat' once
  // Mireveil falls, exactly as it does for every other boss-gated mission.
  // A fall to her mid-fight is not a failure of the approach or the dormancy
  // wiring this spec exists to prove, so the loop rides out the arcade
  // continue (issue #99) exactly as a real player would rather than treating
  // 'failed' as the end of the run.
  for (let poll = 0; poll < 4200; poll++) {
    state = await getState(page);
    if (state.phase === 'failed') {
      if (!continuePressed) {
        await driver.releaseAll();
        await page.keyboard.press('Enter');
        continuePressed = true;
        continuesTaken++;
      }
      await page.waitForTimeout(60);
      continue;
    }
    continuePressed = false;
    if (state.phase !== 'combat') break;
    maxConcurrentEnemies = Math.max(maxConcurrentEnemies, state.enemies.length);
    if (state.boss?.active) sawBossActive = true;
    for (const encounter of state.encounters) {
      if (encounter.active && !activationOrder.includes(encounter.id)) activationOrder.push(encounter.id);
    }
    await driver.set(actionToKeys(bot.decide(state)));
    await page.waitForTimeout(60);
  }
  await driver.releaseAll();

  if (state.phase !== 'exit-open') {
    console.log(bot.trace.slice(-60).join('\n'));
    console.log('activation order:', activationOrder.join(' -> '), 'continues taken:', continuesTaken);
  }
  expect(state.phase, 'Mireveil should have fallen').toBe('exit-open');

  // The boss threshold must have woken last, and only after both sanctums.
  expect(activationOrder).toHaveLength(3);
  expect(activationOrder.slice(0, 2).sort()).toEqual(['east-sanctum', 'west-sanctum']);
  expect(activationOrder[2]).toBe('boss-threshold');
  expect(sawBossActive).toBe(true);

  // Walk to the portal and finish.
  for (let poll = 0; poll < 400; poll++) {
    state = await getState(page);
    if (state.phase === 'complete') break;
    maxConcurrentEnemies = Math.max(maxConcurrentEnemies, state.enemies.length);
    await driver.set(actionToKeys(bot.decide(state)));
    await page.waitForTimeout(60);
  }
  await driver.releaseAll();
  expect(state.phase, 'the portal should have been reached').toBe('complete');

  const pacing = await getPacingReport(page);
  console.log(`Hollow Throne pacing: ${JSON.stringify({ ...pacing, polledPeak: maxConcurrentEnemies, activationOrder })}`);
  expect(pacing.finalObjectiveToExitTiles).toBeGreaterThanOrEqual(4);
  expect(pacing.finalObjectiveToExitTiles).toBeLessThanOrEqual(8);
  expect(pacing.generatorClearOrder).toHaveLength(HOLLOW_THRONE.generators.length);
  // The sim counts the peak every tick; the polled value above can only miss
  // spikes between polls, so assert on the sim's — the measured four-player
  // co-active cap is unit-tested, this is the measured solo hostile peak.
  expect(pacing.maxConcurrentEnemies).toBeGreaterThan(0);
  expect(pacing.maxConcurrentEnemies).toBeLessThanOrEqual(HOSTILE_CEILING);
  expect(maxConcurrentEnemies).toBeLessThanOrEqual(pacing.maxConcurrentEnemies);

  await page.screenshot({ path: 'test-results/151-02-throne-complete.png' });
  expect(consoleErrors).toEqual([]);
});
