import { expect, test, type Page } from '@playwright/test';
import { firstClearBonus, RESIN_GALLERIES } from '../src/content';
import { actionToKeys, getPacingReport, getState, WarrensBot, type MissionPacingReport } from './bot';
import { BUTTON, installFakePads, PadDriver } from './gamepads';

const PROFILE_KEY = 'hive-legends-profile-v1';

function unlockedResinProfile(): Record<string, unknown> {
  return {
    bank: 0,
    upgrades: {},
    missionsCompleted: 1,
    bestClearTicks: {},
    unlockedHeroes: [],
    clearedLevels: ['brood-warrens'],
    mastery: {},
    weapons: {},
    xp: 0,
    volume: 0.7,
    muted: true
  };
}

async function seedUnlockedResin(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, profile]) => localStorage.setItem(key, JSON.stringify(profile)),
    [PROFILE_KEY, unlockedResinProfile()] as const
  );
}

async function startResinWithKeyboard(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      async () => {
        const state = await getState(page);
        if (state !== null) return state.generators.length;
        await page.keyboard.press('Enter');
        return undefined;
      },
      { timeout: 30_000, intervals: [250] }
    )
    .toBe(4);
}

class KeyDriver {
  private held = new Set<string>();

  constructor(private page: Page) {}

  async set(keys: string[]): Promise<void> {
    const wanted = new Set(keys);
    for (const key of [...this.held]) {
      if (!wanted.has(key)) {
        await this.page.keyboard.up(key);
        this.held.delete(key);
      }
    }
    for (const key of wanted) {
      if (!this.held.has(key)) {
        await this.page.keyboard.down(key);
        this.held.add(key);
      }
    }
  }

  release(): Promise<void> {
    return this.set([]);
  }
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

test('a solo hero clears The Resin Galleries south-to-north expedition', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  await seedUnlockedResin(page);
  await startResinWithKeyboard(page);

  const driver = new KeyDriver(page);
  const bot = new WarrensBot(0, RESIN_GALLERIES);
  const deadline = Date.now() + 200_000;
  let terminal = await getState(page);
  let pacingReport: MissionPacingReport | null = null;
  let finaleShotTaken = false;

  while (Date.now() < deadline) {
    const state = await getState(page);
    terminal = state;
    pacingReport = await getPacingReport(page);
    if (!state || state.phase === 'complete' || state.phase === 'failed') break;

    await driver.set(actionToKeys(bot.decide(state)));
    const hero = state.players[0]!;
    const finale = state.generators.find(
      (generator) => generator.encounterId === 'crown-brood' && generator.active
    );
    if (!finaleShotTaken && finale && Math.hypot(finale.pos.x - hero.pos.x, finale.pos.y - hero.pos.y) < 250) {
      await page.screenshot({ path: 'test-results/issue150-crown-finale.png' });
      finaleShotTaken = true;
    }
    await page.waitForTimeout(90);
  }
  await driver.release();

  if (terminal?.phase !== 'complete') {
    console.log(`--- Resin solo bot trace (last 80 of ${bot.trace.length} polls) ---`);
    for (const line of bot.trace.slice(-80)) console.log(line);
  }
  expect(terminal?.phase).toBe('complete');
  expect(finaleShotTaken).toBe(true);
  expect(pacingReport).toMatchObject({
    routeDistanceTiles: 140,
    finalObjectiveToExitTiles: 7,
    generatorClearOrder: [
      'lower-brood-basin',
      'husk-kiln-mound',
      'upper-west-brood',
      'crown-brood-node'
    ]
  });
  expect(pacingReport!.elapsedMissionTicks).toBeGreaterThan(0);
  expect(pacingReport!.maxConcurrentEnemies).toBeGreaterThan(0);
  expect(pacingReport!.maxConcurrentEnemies).toBeLessThanOrEqual(15);
  console.log(`Resin Galleries solo pacing: ${JSON.stringify(pacingReport)}`);

  await expect
    .poll(
      () =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          return raw ? (JSON.parse(raw).missionsCompleted ?? 0) : 0;
        }, PROFILE_KEY),
      { timeout: 10_000 }
    )
    .toBe(2);
  await page.screenshot({ path: 'test-results/issue150-solo-results.png' });
  expect(consoleErrors.filter((error) => !error.includes('favicon'))).toEqual([]);
});

test('four heroes clear The Resin Galleries within the hostile ceiling', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  await seedUnlockedResin(page);
  await installFakePads(page);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

  const drivers = Array.from({ length: 4 }, (_, slot) => new PadDriver(page, slot));
  await drivers[0]!.connect();
  await expect
    .poll(
      async () => {
        const state = await getState(page);
        if (state !== null) return state.generators.length;
        await drivers[0]!.tap(BUTTON.a);
        return undefined;
      },
      { timeout: 30_000, intervals: [250] }
    )
    .toBe(4);

  for (let slot = 1; slot < drivers.length; slot++) {
    const driver = drivers[slot]!;
    await driver.connect();
    await driver.release();
    await page.waitForTimeout(250);
    await driver.tap(BUTTON.start);
    await expect
      .poll(async () => (await getState(page)).players.find((player) => player.slot === slot)?.participating)
      .toBe(true);
  }
  await page.screenshot({ path: 'test-results/issue150-four-player-joined.png' });

  const bots = drivers.map((_, slot) => new WarrensBot(slot, RESIN_GALLERIES));
  const deadline = Date.now() + 200_000;
  let terminal = await getState(page);
  let pacingReport: MissionPacingReport | null = null;

  while (Date.now() < deadline) {
    const state = await getState(page);
    terminal = state;
    pacingReport = await getPacingReport(page);
    if (!state || state.phase === 'complete' || state.phase === 'failed') break;
    await Promise.all(drivers.map((driver, slot) => driver.play(bots[slot]!.decide(state))));
    await page.waitForTimeout(90);
  }
  await Promise.all(drivers.map((driver) => driver.release()));

  if (terminal?.phase !== 'complete') {
    for (const [index, bot] of bots.entries()) {
      console.log(`--- Resin P${index + 1} bot trace (last 60) ---`);
      for (const line of bot.trace.slice(-60)) console.log(line);
    }
  }
  expect(terminal?.phase).toBe('complete');
  expect(terminal!.players).toHaveLength(4);
  expect(terminal!.players.every((player) => player.participating)).toBe(true);
  expect(pacingReport).toMatchObject({
    routeDistanceTiles: 140,
    finalObjectiveToExitTiles: 7,
    generatorClearOrder: [
      'lower-brood-basin',
      'husk-kiln-mound',
      'upper-west-brood',
      'crown-brood-node'
    ]
  });
  expect(pacingReport!.maxConcurrentEnemies).toBeGreaterThan(0);
  expect(pacingReport!.maxConcurrentEnemies).toBeLessThanOrEqual(15);
  console.log(`Four-player Resin Galleries hostile peak: ${pacingReport!.maxConcurrentEnemies}`);
  expect(terminal!.players.reduce((sum, player) => sum + player.gold, 0)).toBe(terminal!.rewards.gold);
  expect(terminal!.players.reduce((sum, player) => sum + player.xpEarned, 0)).toBe(terminal!.rewards.xp);

  await expect
    .poll(
      () =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          return raw ? (JSON.parse(raw).missionsCompleted ?? 0) : 0;
        }, PROFILE_KEY),
      { timeout: 10_000 }
    )
    .toBe(2);
  const profile = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), PROFILE_KEY);
  expect(profile.clearedLevels).toContain('resin-galleries');
  expect(profile.bank).toBe(terminal!.rewards.gold + firstClearBonus(RESIN_GALLERIES));
  expect(profile.xp).toBe(terminal!.rewards.xp);
  await page.screenshot({ path: 'test-results/issue150-four-player-results.png' });
  expect(consoleErrors.filter((error) => !error.includes('favicon'))).toEqual([]);
});
