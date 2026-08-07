import { expect, test, type Page } from '@playwright/test';
import { CONTENT } from '../src/content';
import type { Profile } from '../src/meta/save';
import type { SimState } from '../src/sim/types';
import { nextWaypoint } from './bot';

/**
 * The arcade continue (issue #99), end to end in the real build.
 *
 * The bot does not fight here — it wakes the first staged encounter, then
 * stands still and lets the Warrens kill it. Everything the prompt does is observable
 * through the read-only `__hive` handle: the sim stops ticking while the offer
 * is up, and a bought continue puts the hero back on their feet at the revive
 * def's HP.
 */

const PROFILE_KEY = 'hive-legends-profile-v1';
const START_BANK = 500;

async function getState(page: Page): Promise<SimState | null> {
  return (await page.evaluate(() => {
    const hive = (globalThis as Record<string, unknown>).__hive as { getState: () => unknown } | undefined;
    return hive ? hive.getState() : null;
  })) as SimState | null;
}

async function savedProfile(page: Page): Promise<Profile> {
  return (await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), PROFILE_KEY)) as Profile;
}

/** Walks through the real input path until the first staged nest wakes. */
async function wakeFirstEncounter(page: Page): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const state = await getState(page);
    if (state?.generators.some((generator) => generator.active)) return;
    const player = state?.players[0];
    const target = state?.generators[0]?.pos;
    if (!player || !target) break;
    const waypoint = nextWaypoint(player.pos, target) ?? target;
    const dx = waypoint.x - player.pos.x;
    const dy = waypoint.y - player.pos.y;
    const key = Math.abs(dx) > Math.abs(dy)
      ? dx > 0 ? 'ArrowRight' : 'ArrowLeft'
      : dy > 0 ? 'ArrowDown' : 'ArrowUp';
    await page.keyboard.down(key);
    await page.waitForTimeout(120);
    await page.keyboard.up(key);
  }
  expect((await getState(page))?.generators.some((generator) => generator.active)).toBe(true);
}

/** Stands still until the hive finishes the job. */
async function dieHere(page: Page): Promise<void> {
  await expect
    .poll(async () => (await getState(page))?.phase, { timeout: 90_000, intervals: [500] })
    .toBe('failed');
}

test('a fallen run can buy a continue, and declining still ends it', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const profile: Profile = {
    bank: START_BANK,
    upgrades: {},
    missionsCompleted: 0,
    bestClearTicks: {},
    unlockedHeroes: [],
    clearedLevels: [],
    mastery: {},
    weapons: {},
    xp: 0,
    volume: 0.7,
    muted: true,
    reduceMotion: false
  };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: PROFILE_KEY,
    value: profile
  });

  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
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

  // --- fall once ----------------------------------------------------------
  await wakeFirstEncounter(page);
  await dieHere(page);

  // The offer freezes the run: a fallen hero must not accrue mission time
  // while the player reads a price.
  const frozenAt = (await getState(page))!.tick;
  await page.screenshot({ path: 'test-results/11-continue-prompt.png' });
  await page.waitForTimeout(600);
  expect((await getState(page))!.tick).toBe(frozenAt);

  // --- take it ------------------------------------------------------------
  const cost = CONTENT.economy.continueBaseCost;
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await getState(page))?.phase, { timeout: 10_000 }).toBe('combat');

  const revived = (await getState(page))!.players[0]!;
  expect(revived.alive).toBe(true);
  expect(revived.hp).toBe(Math.round(revived.maxHp * CONTENT.revive.hpFraction));
  // The price came out of the bank the moment it was taken, not at results.
  expect((await savedProfile(page)).bank).toBe(START_BANK - cost);
  await expect.poll(async () => (await getState(page))!.tick).toBeGreaterThan(frozenAt);
  await page.screenshot({ path: 'test-results/12-continued-run.png' });

  // --- fall again, and decline -------------------------------------------
  await dieHere(page);
  await page.keyboard.press('Escape');

  // Declining routes to results exactly as it did before the continue existed:
  // the mission handle is cleared and the defeat is banked as a defeat.
  await expect.poll(async () => getState(page), { timeout: 15_000 }).toBeNull();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/13-continue-declined-results.png' });

  const after = await savedProfile(page);
  expect(after.bank).toBe(START_BANK - cost); // declining costs nothing more
  expect(after.missionsCompleted).toBe(0);
  expect(after.clearedLevels).toEqual([]);
  expect(after.bestClearTicks).toEqual({}); // a loss is not a clear time

  const fatal = consoleErrors.filter((error) => !error.includes('favicon'));
  expect(fatal).toEqual([]);
});
