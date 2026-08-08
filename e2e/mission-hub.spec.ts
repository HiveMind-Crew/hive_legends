import { expect, test, type Page } from '@playwright/test';
import { CONTENT } from '../src/content';
import { installFakePads, PadDriver } from './gamepads';

interface MissionHubState {
  authoredNodeCount: number;
  nodeCount: number;
  selectedIndex: number;
  selectedLevelId: string | null;
  selectedLabel: string;
  selectedStatus: string;
  selectedAction: string;
  heroId: string;
  upgradeRouteLabel: string;
  selectedLabelCount: number;
  selectedNameCount: number;
  selectedStateCount: number;
}

interface ResultsState {
  mode: 'run' | 'shop';
  heroId: string;
  levelId: string;
  bank: number;
  selectedRow: number;
  selectedCol: number;
  navigationActions: {
    id: string;
    label: string;
    detail: string;
    state: string;
  }[];
}

async function getHubState(page: Page): Promise<MissionHubState | null> {
  return (await page.evaluate(() => {
    const hub = (globalThis as Record<string, unknown>).__hiveHub as
      | { getState: () => MissionHubState }
      | undefined;
    return hub ? hub.getState() : null;
  })) as MissionHubState | null;
}

async function getResultsState(page: Page): Promise<ResultsState | null> {
  return (await page.evaluate(() => {
    const results = (globalThis as Record<string, unknown>).__hiveResults as
      | { getState: () => ResultsState }
      | undefined;
    return results ? results.getState() : null;
  })) as ResultsState | null;
}

async function enterHub(page: Page): Promise<MissionHubState> {
  await expect
    .poll(
      async () => {
        if ((await getHubState(page)) !== null) return true;
        await page.keyboard.press('Enter');
        return false;
      },
      { timeout: 20_000, intervals: [250] }
    )
    .toBe(true);
  return (await getHubState(page))!;
}

async function leaveHub(page: Page): Promise<void> {
  await page.keyboard.press('h');
  await expect.poll(async () => getHubState(page), { timeout: 10_000 }).toBeNull();
}

test('revisiting the mission hub keeps authored nodes and labels singular', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

  const authoredNodeCount = CONTENT.spokes.reduce((total, spoke) => total + spoke.missions.length + 1, 0);
  const first = await enterHub(page);
  // A settle for the screenshot only — correctness must not depend on this delay.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/issue139-hub-available.png' });
  const originalSelection = {
    selectedIndex: first.selectedIndex,
    selectedLevelId: first.selectedLevelId,
    selectedLabel: first.selectedLabel,
    selectedStatus: first.selectedStatus,
    selectedAction: first.selectedAction
  };

  for (let visit = 0; visit < 3; visit++) {
    const hub = await getHubState(page);
    expect(hub).not.toBeNull();
    expect(hub!.authoredNodeCount).toBe(authoredNodeCount);
    expect(hub!.nodeCount).toBe(authoredNodeCount);
    expect(hub!.selectedLabelCount).toBe(1);
    expect(hub!.selectedNameCount).toBe(1);
    expect(hub!.selectedStateCount).toBe(1);

    for (let press = 0; press < authoredNodeCount; press++) await page.keyboard.press('ArrowDown');

    const afterCycle = await getHubState(page);
    expect(afterCycle).toMatchObject({
      ...originalSelection,
      selectedLabelCount: 1,
      selectedNameCount: 1,
      selectedStateCount: 1
    });

    if (visit < 2) {
      await leaveHub(page);
      await enterHub(page);
    }
  }
});

test('pointer hover and click use the shared cursor for a readable locked mission', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await enterHub(page);

  // Native 960×720 layout: the fourth route row is the locked boss.
  await page.mouse.move(200, 560);
  await expect
    .poll(async () => getHubState(page), { timeout: 5_000 })
    .toMatchObject({ selectedLevelId: 'hollow-throne', selectedStatus: expect.stringContaining('LOCKED') });
  const locked = await getHubState(page);
  await page.mouse.click(200, 560);
  await expect.poll(async () => getHubState(page), { timeout: 5_000 }).toMatchObject({
    selectedLevelId: locked!.selectedLevelId,
    selectedStatus: locked!.selectedStatus
  });
  await expect.poll(async () => getHubState(page), { timeout: 5_000 }).not.toBeNull();
  // A settle for the screenshot only — correctness must not depend on this delay.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/issue139-hub-locked.png' });
});

test('upgrades can be left and revisited without banking another run', async ({ page }) => {
  const seededProfile = {
    bank: 1000,
    upgrades: {},
    missionsCompleted: 7,
    bestClearTicks: { 'brood-warrens': 1234 },
    unlockedHeroes: ['arcanist', 'ranger', 'sentinel'],
    clearedLevels: ['brood-warrens'],
    mastery: { 'brood-warrens': ['vanguard'] },
    weapons: {},
    abilitySpecializations: {},
    xp: 777,
    volume: 0.7,
    muted: false,
    reduceMotion: false,
    tutorialsSeen: ['gold-pickup']
  };
  await installFakePads(page);
  await page.addInitScript((profile) => {
    localStorage.setItem('hive-legends-profile-v1', JSON.stringify(profile));
  }, seededProfile);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

  // Select a non-default hero, then move off the suggested mission so both pieces of
  // hub state have a meaningful value to preserve through the shop.
  await page.waitForTimeout(500);
  await page.keyboard.press('ArrowRight');
  // Hero Select restarts itself after each roster move; wait for the new scene
  // to bind before sending the second move.
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  await enterHub(page);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => getHubState(page)).toMatchObject({
    heroId: 'ranger',
    selectedLevelId: 'cobalt-combs',
    upgradeRouteLabel: expect.stringContaining('UPGRADES')
  });
  const beforeEntry = await page.evaluate(() => JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null'));

  // Keyboard entry is shop-only: opening it cannot claim gold/XP, increment a
  // completion, add mastery/clears, or change the recorded clear time.
  await page.keyboard.press('u');
  await expect.poll(async () => getResultsState(page)).toMatchObject({
    mode: 'shop',
    heroId: 'ranger',
    levelId: 'cobalt-combs',
    bank: 1000
  });
  expect((await getResultsState(page))?.navigationActions[0]).toMatchObject({
    id: 'mission-select',
    label: 'MISSION SELECT',
    detail: 'REVIEW THE MISSION MAP',
    state: 'default'
  });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null'))).toEqual(beforeEntry);
  await page.screenshot({ path: 'test-results/issue145-upgrades-native.png' });
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect
    .poll(async () => (await page.locator('canvas').boundingBox())?.height ?? 0, { timeout: 10_000 })
    .toBeCloseTo(600, 0);
  await page.screenshot({ path: 'test-results/issue145-upgrades-scaled.png' });
  await page.setViewportSize({ width: 960, height: 720 });
  await expect
    .poll(async () => (await page.locator('canvas').boundingBox())?.width ?? 0, { timeout: 10_000 })
    .toBeCloseTo(960, 0);

  // A real purchase persists, while every run-result field stays byte-for-byte
  // equal to the pre-entry snapshot.
  await page.keyboard.press('1');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null')))
    .toMatchObject({ bank: 920, upgrades: { vitality: 1 } });
  const afterPurchase = await page.evaluate(() => JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null'));
  for (const field of ['missionsCompleted', 'bestClearTicks', 'clearedLevels', 'mastery', 'xp', 'unlockedHeroes', 'tutorialsSeen'] as const) {
    expect(afterPurchase[field]).toEqual(beforeEntry[field]);
  }

  // Escape restores the exact hub cursor and selected hero. Pointer entry and
  // the visible WHEEL action then exercise the same route in both directions.
  await page.keyboard.press('Escape');
  await expect.poll(async () => getHubState(page)).toMatchObject({
    heroId: 'ranger',
    selectedLevelId: 'cobalt-combs'
  });

  // The legacy W intent now traverses the polished Mission Select action but
  // remains pinned to the explicit shop origin rather than the next mission.
  await page.keyboard.press('u');
  await expect.poll(async () => getResultsState(page)).toMatchObject({ mode: 'shop', bank: 920 });
  await page.keyboard.press('w');
  expect((await getResultsState(page))?.navigationActions[0]).toMatchObject({
    id: 'mission-select',
    state: 'activated'
  });
  await expect.poll(async () => getHubState(page)).toMatchObject({
    heroId: 'ranger',
    selectedLevelId: 'cobalt-combs'
  });

  await page.mouse.click(830, 650);
  await expect.poll(async () => getResultsState(page)).toMatchObject({ mode: 'shop', bank: 920 });
  await page.mouse.move(170, 680);
  await expect.poll(async () => getResultsState(page)).toMatchObject({
    selectedRow: 2,
    selectedCol: 0,
    navigationActions: [
      { id: 'mission-select', state: 'focused' },
      { id: 'replay', state: 'default' },
      { id: 'hero-select', state: 'default' }
    ]
  });
  await page.mouse.click(170, 680);
  await expect.poll(async () => getHubState(page)).toMatchObject({
    heroId: 'ranger',
    selectedLevelId: 'cobalt-combs'
  });

  // Fake standard pad: (Y) opens the clearly labelled route and (B) cancels
  // back to the origin. This is browser gamepad integration, not hardware QA.
  const pad = new PadDriver(page, 0);
  await pad.connect();
  await page.waitForTimeout(300);
  await pad.tap(3);
  await expect.poll(async () => getResultsState(page)).toMatchObject({
    mode: 'shop',
    heroId: 'ranger',
    levelId: 'cobalt-combs',
    bank: 920
  });
  await pad.tap(1);
  await expect.poll(async () => getHubState(page)).toMatchObject({
    heroId: 'ranger',
    selectedLevelId: 'cobalt-combs'
  });

  const finalProfile = await page.evaluate(() => JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null'));
  expect(finalProfile).toEqual(afterPurchase);
});
