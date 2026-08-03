import { expect, test, type Page } from '@playwright/test';
import { CONTENT } from '../src/content';

interface MissionHubState {
  authoredNodeCount: number;
  nodeCount: number;
  selectedIndex: number;
  selectedLevelId: string | null;
  selectedLabel: string;
  selectedStatus: string;
  selectedAction: string;
  selectedLabelCount: number;
  selectedStateCount: number;
}

async function getHubState(page: Page): Promise<MissionHubState | null> {
  return (await page.evaluate(() => {
    const hub = (globalThis as Record<string, unknown>).__hiveHub as
      | { getState: () => MissionHubState }
      | undefined;
    return hub ? hub.getState() : null;
  })) as MissionHubState | null;
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
    expect(hub!.selectedStateCount).toBe(1);

    for (let press = 0; press < authoredNodeCount; press++) await page.keyboard.press('ArrowDown');

    const afterCycle = await getHubState(page);
    expect(afterCycle).toMatchObject({
      ...originalSelection,
      selectedLabelCount: 1,
      selectedStateCount: 1
    });

    if (visit < 2) {
      await leaveHub(page);
      await enterHub(page);
    }
  }
});
