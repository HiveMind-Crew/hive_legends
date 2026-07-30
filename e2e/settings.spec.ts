import { expect, test, type Page } from '@playwright/test';
import { defaultProfile, type Profile } from '../src/meta/save';
import type { SimState } from '../src/sim/types';

const PROFILE_KEY = 'hive-legends-profile-v1';

interface SettingsState {
  volume: number;
  muted: boolean;
  confirmingReset: boolean;
  returnScene: string;
}

async function getSettings(page: Page): Promise<SettingsState | null> {
  return page.evaluate(() => {
    const handle = (globalThis as Record<string, unknown>).__hiveSettings as
      | { getState: () => SettingsState }
      | undefined;
    return handle?.getState() ?? null;
  });
}

async function getMission(page: Page): Promise<SimState | null> {
  return page.evaluate(() => {
    const handle = (globalThis as Record<string, unknown>).__hive as
      | { getState: () => SimState }
      | undefined;
    return handle?.getState() ?? null;
  });
}

async function openSettings(page: Page): Promise<SettingsState> {
  await expect
    .poll(
      async () => {
        const settings = await getSettings(page);
        if (settings) return settings;
        await page.keyboard.press('s');
        return null;
      },
      { timeout: 20_000, intervals: [250] }
    )
    .not.toBeNull();
  return (await getSettings(page))!;
}

async function enterMission(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        if ((await getMission(page)) !== null) return true;
        await page.keyboard.press('Enter');
        return false;
      },
      { timeout: 20_000, intervals: [250] }
    )
    .toBe(true);
}

test('settings persist volume, reset the profile, and open from a paused run', async ({ page }) => {
  const profile: Profile = {
    ...defaultProfile(),
    bank: 321,
    upgrades: { vitality: 2 },
    missionsCompleted: 2,
    clearedLevels: ['brood-warrens'],
    unlockedHeroes: ['arcanist'],
    xp: 180
  };
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    },
    { key: PROFILE_KEY, value: profile }
  );

  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  expect((await openSettings(page)).returnScene).toBe('hero-select');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await getSettings(page))?.volume).toBe(0.6);
  await page.screenshot({ path: 'test-results/01c-settings.png' });

  await page.reload();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  expect((await openSettings(page)).volume).toBe(0.6);

  await page.keyboard.press('r');
  await expect.poll(async () => (await getSettings(page))?.confirmingReset).toBe(true);
  await page.screenshot({ path: 'test-results/01d-reset-confirm.png' });
  await page.keyboard.press('Enter');
  await expect.poll(async () => getSettings(page)).toBeNull();
  const reset = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), PROFILE_KEY);
  expect(reset).toEqual(defaultProfile());

  // Reset returns to the front-door hero-select scene, which can immediately
  // reopen settings and reports that scene as its return target.
  expect((await openSettings(page)).returnScene).toBe('hero-select');
  await page.keyboard.press('Escape');
  await expect.poll(async () => getSettings(page)).toBeNull();

  await enterMission(page);
  await expect.poll(async () => (await getMission(page))?.tick ?? 0).toBeGreaterThan(5);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const pausedAt = (await getMission(page))!.tick;
  await page.keyboard.press('s');
  await expect.poll(async () => (await getSettings(page))?.returnScene).toBe('mission');

  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await getSettings(page))?.volume).toBe(0.8);
  await page.keyboard.press('Escape');
  await expect.poll(async () => getSettings(page)).toBeNull();
  await page.waitForTimeout(300);
  expect((await getMission(page))!.tick).toBe(pausedAt);

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await getMission(page))?.tick ?? 0).toBeGreaterThan(pausedAt);
});
