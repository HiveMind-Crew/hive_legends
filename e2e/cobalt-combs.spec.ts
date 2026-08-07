import { expect, test, type Page } from '@playwright/test';
import { COBALT_COMBS } from '../src/content/levels/cobaltCombs';
import { actionToKeys, getPacingReport, getState, WarrensBot } from './bot';

/**
 * The braided Cobalt Combs (#148) played by the same bot brain as the Warrens,
 * through the same keyboard path.
 *
 * What this proves that a unit test cannot: the two arms are actually navigable
 * in whichever order the bot picks, the merge wakes only after both are down,
 * and a real run stays under the hostile ceiling. The unit tests pin the budgets;
 * this pins that the geometry is playable.
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

test('a player can clear the braided Cobalt Combs in either arm order', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  // The Combs is mission 3, so seed the two clears that unlock it. Everything
  // about unlocking derives from `clearedLevels` (docs/PROGRESSION.md).
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: PROFILE_KEY, value: { clearedLevels: ['brood-warrens', 'resin-galleries'], gold: 0, bankedXp: 0 } }
  );
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('canvas') !== null);
  await page.waitForTimeout(2000);

  // Hero select -> hub, then walk the hub cursor onto the Combs and deploy.
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
  expect(state, 'the bot never reached a mission').not.toBeNull();
  expect(state.generators).toHaveLength(COBALT_COMBS.generators.length);
  // Every stage starts dormant, which is the whole point of staged pacing.
  expect(state.generators.filter((generator) => generator.active)).toHaveLength(0);
  await page.screenshot({ path: 'test-results/148-01-combs-start.png' });

  const bot = new WarrensBot(0, COBALT_COMBS);
  const driver = new KeyDriver(page);
  const activationOrder: string[] = [];
  let maxConcurrentEnemies = 0;

  for (let poll = 0; poll < 1600; poll++) {
    state = await getState(page);
    if (state.phase !== 'combat') break;
    maxConcurrentEnemies = Math.max(maxConcurrentEnemies, state.enemies.length);
    for (const encounter of state.encounters) {
      if (encounter.active && !activationOrder.includes(encounter.id)) activationOrder.push(encounter.id);
    }
    await driver.set(actionToKeys(bot.decide(state)));
    await page.waitForTimeout(60);
  }
  await driver.releaseAll();

  if (state.phase !== 'exit-open') {
    console.log(bot.trace.slice(-40).join('\n'));
    console.log('activation order:', activationOrder.join(' -> '));
  }
  expect(state.phase, 'every spawner should be down').toBe('exit-open');

  // The merge and breach must have woken last, and only after both arms.
  expect(activationOrder).toHaveLength(4);
  expect(activationOrder.slice(0, 2).sort()).toEqual(['husk-arm', 'spitter-arm']);
  expect(activationOrder[2]).toBe('merge');
  expect(activationOrder[3]).toBe('breach');

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
  console.log(`Cobalt Combs pacing: ${JSON.stringify({ ...pacing, polledPeak: maxConcurrentEnemies, activationOrder })}`);
  // The measured route is the shortest permutation; the playable orders are
  // longer, so this is a floor, not the branch-parity budget (unit-tested).
  expect(pacing.routeDistanceTiles).toBe(123);
  expect(pacing.finalObjectiveToExitTiles).toBeGreaterThanOrEqual(4);
  expect(pacing.finalObjectiveToExitTiles).toBeLessThanOrEqual(8);
  expect(pacing.generatorClearOrder).toHaveLength(COBALT_COMBS.generators.length);
  // The sim counts the peak every tick; the polled value above can only miss
  // spikes between polls, so assert on the sim's.
  expect(pacing.maxConcurrentEnemies).toBeGreaterThan(0);
  expect(pacing.maxConcurrentEnemies).toBeLessThanOrEqual(HOSTILE_CEILING);
  expect(maxConcurrentEnemies).toBeLessThanOrEqual(pacing.maxConcurrentEnemies);

  await page.screenshot({ path: 'test-results/148-02-combs-complete.png' });
  expect(consoleErrors).toEqual([]);
});
