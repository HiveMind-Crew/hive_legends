import { expect, test } from '@playwright/test';
import { firstClearBonus } from '../src/content';
import { BROOD_WARRENS } from '../src/content/levels/broodWarrens';
import { getState, WarrensBot } from './bot';
import { BUTTON, installFakePads, PadDriver } from './gamepads';

test('four independent gamepads join and clear The Brood Warrens under the hostile ceiling', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  await installFakePads(page);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  const drivers = Array.from({ length: 4 }, (_, slot) => new PadDriver(page, slot));
  const p1 = drivers[0]!;
  const p2 = drivers[1]!;
  await p1.connect();

  await expect
    .poll(
      async () => {
        if ((await getState(page)) !== null) return true;
        await p1.tap(BUTTON.a);
        return false;
      },
      { timeout: 30_000, intervals: [250] }
    )
    .toBe(true);

  // A newly visible device only establishes an input baseline. START is an
  // explicit, replayable join edge after that baseline, never device mutation.
  for (let slot = 1; slot < drivers.length; slot++) {
    const driver = drivers[slot]!;
    await driver.connect();
    await driver.release();
    await page.waitForTimeout(250);
    await driver.tap(BUTTON.start);
    await expect.poll(async () => (await getState(page)).players.find((p) => p.slot === slot)?.participating).toBe(true);
  }
  await page.screenshot({ path: 'test-results/14-four-player-joined.png' });

  // Transient loss leaves an idle active body. Only BACK makes it dormant;
  // START rejoins the same state object with its contributions intact.
  const joinedId = (await getState(page)).players.find((p) => p.slot === 1)!.id;
  await p2.disconnect();
  await page.waitForTimeout(350);
  expect((await getState(page)).players.find((p) => p.slot === 1)).toMatchObject({ id: joinedId, participating: true });
  await p2.connect();
  await p2.release();
  await page.waitForTimeout(250);
  await p2.tap(BUTTON.back);
  await expect.poll(async () => (await getState(page)).players.find((p) => p.slot === 1)?.participating).toBe(false);
  await p2.tap(BUTTON.start);
  await expect.poll(async () => (await getState(page)).players.find((p) => p.slot === 1)?.participating).toBe(true);

  // Prove the command streams address different slots before handing all four
  // to the shared playthrough brain.
  const before = await getState(page);
  await p1.set([0.85, 0, 0, 0], []);
  await p2.set([0, 0.85, 0, 0], []);
  await page.waitForTimeout(300);
  await p1.release();
  await p2.release();
  const moved = await getState(page);
  expect(moved.players.find((p) => p.slot === 0)!.pos.x).toBeGreaterThan(before.players.find((p) => p.slot === 0)!.pos.x);
  expect(moved.players.find((p) => p.slot === 1)!.pos.y).toBeGreaterThan(before.players.find((p) => p.slot === 1)!.pos.y);

  const bots = drivers.map((_, slot) => new WarrensBot(slot));
  const deadline = Date.now() + 180_000;
  let terminal = await getState(page);
  let maxConcurrentEnemies = terminal.enemies.length;
  while (Date.now() < deadline) {
    const state = await getState(page);
    terminal = state;
    maxConcurrentEnemies = Math.max(maxConcurrentEnemies, state.enemies.length);
    if (!state || state.phase === 'complete' || state.phase === 'failed') break;
    await Promise.all(drivers.map((driver, slot) => driver.play(bots[slot]!.decide(state))));
    await page.waitForTimeout(90);
  }
  await Promise.all(drivers.map((driver) => driver.release()));

  if (terminal?.phase !== 'complete') {
    for (const [index, bot] of bots.entries()) {
      console.log(`--- P${index + 1} co-op bot trace (last 60) ---`);
      for (const line of bot.trace.slice(-60)) console.log(line);
    }
  }
  expect(terminal?.phase).toBe('complete');
  expect(terminal!.players).toHaveLength(4);
  expect(terminal!.players.every((player) => player.participating)).toBe(true);
  expect(maxConcurrentEnemies).toBeGreaterThan(0);
  expect(maxConcurrentEnemies).toBeLessThanOrEqual(15);
  console.log(`Four-player Brood Warrens hostile peak: ${maxConcurrentEnemies}`);
  expect(terminal!.players.reduce((sum, player) => sum + player.gold, 0)).toBe(terminal!.rewards.gold);
  expect(terminal!.players.reduce((sum, player) => sum + player.xpEarned, 0)).toBe(terminal!.rewards.xp);

  // Contextual lessons may create the profile during combat (#97), so wait
  // for ResultsScene's actual progression bank rather than storage presence.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('hive-legends-profile-v1');
          return raw ? (JSON.parse(raw).missionsCompleted ?? 0) : 0;
        }),
      { timeout: 10_000 }
    )
    .toBe(1);
  const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null'));
  expect(profile.missionsCompleted).toBe(1);
  expect(profile.bank).toBe(terminal!.rewards.gold + firstClearBonus(BROOD_WARRENS));
  expect(profile.xp).toBe(terminal!.rewards.xp);
  await page.waitForTimeout(1_100); // let the bank count-up settle for visual QA
  await page.screenshot({ path: 'test-results/15-four-player-results.png' });

  expect(consoleErrors.filter((error) => !error.includes('favicon'))).toEqual([]);
});
