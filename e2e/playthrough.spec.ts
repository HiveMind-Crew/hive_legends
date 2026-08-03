import { expect, test, type Page } from '@playwright/test';
import { ABILITY_SPECIALIZATIONS } from '../src/content/abilitySpecializations';
import { PROGRESSION } from '../src/content/progression';
import { levelForXp } from '../src/sim/sim';
import { actionToKeys, getState, WarrensBot } from './bot';

/**
 * Full gameplay verification: a bot plays the mission through the real
 * input path (keyboard events), navigating with BFS over the level's wall
 * grid, destroying both Brood Nodes, and walking to the exit. Asserts the
 * mission completes and progression is banked to localStorage.
 *
 * The bot itself lives in `./bot.ts`, because the gamepad playthrough
 * (`gamepad.spec.ts`, issue #98) plays the same mission with the same brain
 * through a different device.
 */

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
  const bot = new WarrensBot();
  const deadline = Date.now() + 180_000;
  let lastPhase = 'combat';
  let screenshotTaken = false;
  let juiceShotTaken = false;
  let damagedNodeShotTaken = false;

  while (Date.now() < deadline) {
    const state = await getState(page);
    if (!state) break;
    lastPhase = state.phase;
    if (state.phase === 'complete' || state.phase === 'failed') break;

    const me = state.players[0]!;
    await driver.set(actionToKeys(bot.decide(state)));

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
    console.log(`--- bot trace (last 80 of ${bot.trace.length} polls) ---`);
    for (const line of bot.trace.slice(-80)) console.log(line);
  }
  expect(lastPhase).toBe('complete');
  // The end-of-mission banner shows first; poll until the results scene has
  // banked the run to the persistent profile rather than sleeping a fixed time.
  // Contextual lessons may create the profile during combat (#97), so mere
  // localStorage presence no longer proves ResultsScene has run.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('hive-legends-profile-v1');
          return raw ? (JSON.parse(raw).missionsCompleted ?? 0) : 0;
        }),
      { timeout: 10_000 }
    )
    .toBeGreaterThanOrEqual(1);
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
  // The clear time is recorded against the realm it was set on, not globally
  // (issue #100) — the seeded profile started with no records at all.
  expect(profile.bestClearTicks['brood-warrens']).toBeGreaterThan(0);
  expect(Object.keys(profile.bestClearTicks)).toEqual(['brood-warrens']);

  // Dynamic Results art must be rebuilt to a stable count as the shared cursor
  // moves; specialization visualization marks are part of that lifecycle.
  const initialResults = await page.evaluate(() =>
    ((globalThis as { __hiveResults?: { getState: () => { dynamicObjectCount: number } } }).__hiveResults?.getState() ?? null)
  );
  expect(initialResults?.dynamicObjectCount).toBeGreaterThan(0);
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(
      async () => page.evaluate(() => ((globalThis as { __hiveResults?: { getState: () => { dynamicObjectCount: number } } }).__hiveResults?.getState() ?? null)),
      { timeout: 5_000 }
    )
    .toMatchObject({ selectedRow: 0, selectedCol: 1, dynamicObjectCount: initialResults!.dynamicObjectCount });
  await page.keyboard.press('ArrowLeft');

  // Pointer hover/click selects the same specialization target as the
  // keyboard path. Opening is modal and cancellation must not spend gold.
  const aftershock = ABILITY_SPECIALIZATIONS['vanguard-aftershock']!;
  const bank: number = profile.bank;
  expect(bank).toBeGreaterThanOrEqual(aftershock.cost);
  await page.mouse.move(700, 520);
  await page.waitForTimeout(100);
  await page.mouse.click(700, 520);
  await expect
    .poll(async () => page.evaluate(() => (globalThis as { __hiveResults?: unknown }).__hiveResults ? true : false))
    .toBe(true);
  await expect
    .poll(
      async () => page.evaluate(() => ((globalThis as { __hiveResults?: { getState: () => unknown } }).__hiveResults?.getState() ?? null)),
      { timeout: 5_000 }
    )
    .toMatchObject({ modalOpen: true, selectedRow: 0, selectedCol: 1 });
  const modalBeforeShortcut = await page.evaluate(() =>
    ((globalThis as { __hiveResults?: { getState: () => { modalOpen: boolean; selectedRow: number; selectedCol: number; bank: number; scenePaused: boolean } } }).__hiveResults?.getState() ?? null)
  );
  await page.keyboard.press('o');
  await expect
    .poll(
      async () => page.evaluate(() => ((globalThis as { __hiveResults?: { getState: () => unknown } }).__hiveResults?.getState() ?? null)),
      { timeout: 5_000 }
    )
    .toMatchObject({
      modalOpen: true,
      selectedRow: modalBeforeShortcut!.selectedRow,
      selectedCol: modalBeforeShortcut!.selectedCol,
      bank: modalBeforeShortcut!.bank,
      scenePaused: false
    });
  await page.screenshot({ path: 'test-results/issue139-results-confirm.png' });
  await page.mouse.click(560, 462); // safe default: Cancel
  await expect
    .poll(
      async () => page.evaluate(() => ((globalThis as { __hiveResults?: { getState: () => unknown } }).__hiveResults?.getState() ?? null)),
      { timeout: 5_000 }
    )
    .toMatchObject({ modalOpen: false, bank });
  const afterCancel = await page.evaluate(() => JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null'));
  expect(afterCancel.abilitySpecializations[aftershock.groupId]).toBeUndefined();

  // Keyboard legacy shortcut first moves the shared cursor, then opens the
  // same modal. Escape cancels; the second attempt moves from safe Cancel to
  // Confirm before the shared confirm action spends exactly once.
  await page.keyboard.press('6');
  await expect
    .poll(
      async () => page.evaluate(() => ((globalThis as { __hiveResults?: { getState: () => unknown } }).__hiveResults?.getState() ?? null)),
      { timeout: 5_000 }
    )
    .toMatchObject({ modalOpen: true, selectedRow: 0, selectedCol: 1 });
  await page.keyboard.press('Escape');
  const cancelledBank = await page.evaluate(() => JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null'));
  expect(cancelledBank.bank).toBe(bank);
  await page.keyboard.press('6');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const afterSpecialization = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null')
  );
  expect(afterSpecialization.abilitySpecializations[aftershock.groupId]).toBe(aftershock.id);
  expect(afterSpecialization.bank).toBe(bank - aftershock.cost);
  await page.screenshot({ path: 'test-results/issue139-results-chosen.png' });
  await page.screenshot({ path: 'test-results/04b-results-specialized.png' });

  // Buy a persistent upgrade in the results shop (Hearthstone Vigor, 80g).
  const shopBank: number = afterSpecialization.bank;
  if (shopBank >= 80) {
    await page.keyboard.press('1');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null')
    );
    expect(after.upgrades.vitality).toBe(1);
    expect(after.bank).toBe(shopBank - 80);
  }

  // Replay: the hero must keep the purchased power (+20 max HP per vitality
  // rank) *and* the level earned from the run's XP (+maxHpPerLevel each).
  await page.keyboard.press('R');
  // The pre-replay handle still reports phase 'complete'; wait for the fresh sim.
  await expect
    .poll(async () => (await getState(page))?.phase, { timeout: 10_000 })
    .toBe('combat');
  const replayState = await getState(page);
  const vitality = shopBank >= 80 ? 1 : 0;
  const heroLevel = levelForXp(PROGRESSION, profile.xp);
  const levelHp = (heroLevel - 1) * PROGRESSION.maxHpPerLevel;
  expect(replayState.players[0]!.level).toBe(heroLevel);
  expect(replayState.players[0]!.maxHp).toBe(120 + 20 * vitality + levelHp);
  await page.keyboard.down('Shift');
  await expect
    .poll(async () => (await getState(page))?.pendingBlasts.length, { timeout: 1000, intervals: [10] })
    .toBe(1);
  await page.keyboard.up('Shift');
  await page.screenshot({ path: 'test-results/05-replay-upgraded.png' });

  // Abandon back to the wheel, which must now show the record the earlier clear
  // set. The dead-field half of issue #100 was that nothing ever displayed it,
  // so the display is worth a shot of the real screen.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await page.keyboard.press('a');
  await expect.poll(async () => getState(page), { timeout: 10_000 }).toBeNull();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/06-wheel-record.png' });

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
        bestClearTicks: {},
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
