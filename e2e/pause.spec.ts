import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/meta/save';
import type { SimState } from '../src/sim/types';

const PROFILE_KEY = 'hive-legends-profile-v1';

async function getState(page: Page): Promise<SimState | null> {
  return (await page.evaluate(() => {
    const hive = (globalThis as Record<string, unknown>).__hive as
      | { getState: () => unknown }
      | undefined;
    return hive ? hive.getState() : null;
  })) as SimState | null;
}

async function enterMission(page: Page): Promise<void> {
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
}

test('pause freezes the sim and abandon returns to the wheel without banking rewards', async ({ page }) => {
  const profile: Profile = {
    bank: 123,
    upgrades: { vitality: 1 },
    missionsCompleted: 0,
    bestClearTicks: null,
    unlockedHeroes: [],
    clearedLevels: [],
    weapons: {},
    xp: 45,
    volume: 0.7,
    muted: true
  };
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: PROFILE_KEY, value: profile }
  );
  await enterMission(page);
  await expect.poll(async () => (await getState(page))?.tick ?? 0).toBeGreaterThan(5);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const pausedAt = (await getState(page))!.tick;
  await page.screenshot({ path: 'test-results/02c-pause-menu.png' });
  await page.waitForTimeout(500);
  expect((await getState(page))!.tick).toBe(pausedAt);

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await getState(page))?.tick ?? 0).toBeGreaterThan(pausedAt);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await page.keyboard.press('a');
  await expect.poll(async () => getState(page)).toBeNull();

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), PROFILE_KEY);
  expect(saved).toEqual(profile);

  // Returning to the wheel is functional: its focused node deploys a fresh
  // mission, which recreates the debug handle that abandon cleared.
  await page.keyboard.press('Enter');
  await expect.poll(async () => getState(page), { timeout: 10_000 }).not.toBeNull();
});
