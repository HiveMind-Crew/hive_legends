import { expect, test, type Page } from '@playwright/test';
import { actionToKeys, getState, WarrensBot, type BotAction } from './bot';

/**
 * Gamepad verification (issue #98): the same bot that clears The Brood Warrens
 * on the keyboard clears it on a pad, and a pad plugged in mid-run starts
 * driving the hero without a reload.
 *
 * The pad is a fake `navigator.getGamepads()` entry rather than hardware.
 * Phaser rebuilds its pad list from that call on every update, which is also
 * exactly why hot-plug works in the real game — the same code path notices a
 * pad that was not there a frame ago.
 */

/** Standard-mapping indices, mirroring `src/game/padMapping.ts`. */
const BUTTON = { a: 0, b: 1, x: 2, y: 3, start: 9 } as const;

declare global {
  interface Window {
    __hivePad: {
      connect: () => void;
      disconnect: () => void;
      set: (axes: number[], pressed: number[]) => void;
    };
  }
}

/**
 * Installs the fake pad, disconnected. `timestamp` has to be live: Phaser
 * ignores a pad frame stamped earlier than the moment it first saw the device.
 */
async function installFakePad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = {
      id: 'Hive Legends Test Pad (STANDARD GAMEPAD)',
      index: 0,
      connected: false,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }))
    };
    Object.defineProperty(pad, 'timestamp', { get: () => performance.now() });

    window.__hivePad = {
      connect: () => {
        pad.connected = true;
      },
      disconnect: () => {
        pad.connected = false;
      },
      set: (axes: number[], pressed: number[]) => {
        pad.axes = axes;
        pad.buttons.forEach((button, index) => {
          const down = pressed.includes(index);
          button.pressed = down;
          button.value = down ? 1 : 0; // Phaser's Button threshold is 1
        });
      }
    };

    navigator.getGamepads = (): (Gamepad | null)[] =>
      [pad.connected ? (pad as unknown as Gamepad) : null, null, null, null];
  });
}

class PadDriver {
  constructor(private page: Page) {}

  connect(): Promise<void> {
    return this.page.evaluate(() => window.__hivePad.connect());
  }

  /** Sticks and buttons for this frame; anything omitted is released. */
  set(axes: number[], pressed: number[]): Promise<void> {
    return this.page.evaluate(
      ([a, b]) => window.__hivePad.set(a as number[], b as number[]),
      [axes, pressed] as const
    );
  }

  release(): Promise<void> {
    return this.set([0, 0, 0, 0], []);
  }

  /** A press the menu layer will see as a rising edge, then released. */
  async tap(button: number): Promise<void> {
    await this.set([0, 0, 0, 0], [button]);
    await this.page.waitForTimeout(120);
    await this.release();
    await this.page.waitForTimeout(120);
  }

  /**
   * Play input. The stick is pushed to 0.85 rather than 1 on purpose: a real
   * analogue deflection has to survive the deadzone and quantise to the sim's
   * integer contract, which a hard 1.0 would not prove.
   */
  play(action: BotAction): Promise<void> {
    const pressed = [...(action.attack ? [BUTTON.a] : []), ...(action.ability ? [BUTTON.x] : [])];
    return this.set([action.moveX * 0.85, action.moveY * 0.85, 0, 0], pressed);
  }
}

test('a gamepad can navigate the shell and clear The Brood Warrens', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await installFakePad(page);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

  const driver = new PadDriver(page);
  await driver.connect();

  // Hero select → the wheel → the mission, entirely on (A). Retried rather
  // than sent twice, for the same reason the keyboard playthrough retries:
  // BootScene may still be generating textures when the canvas appears, and a
  // press that lands before a scene binds its handlers is silently lost.
  await expect
    .poll(
      async () => {
        if ((await getState(page)) !== null) return true;
        await driver.tap(BUTTON.a);
        return false;
      },
      { timeout: 30_000, intervals: [250] }
    )
    .toBe(true);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/07-gamepad-mission-start.png' });

  const bot = new WarrensBot();
  const deadline = Date.now() + 180_000;
  let lastPhase = 'combat';

  while (Date.now() < deadline) {
    const state = await getState(page);
    if (!state) break;
    lastPhase = state.phase;
    if (state.phase === 'complete' || state.phase === 'failed') break;
    await driver.play(bot.decide(state));
    await page.waitForTimeout(90);
  }
  await driver.release();

  if (lastPhase !== 'complete') {
    console.log(`--- pad bot trace (last 80 of ${bot.trace.length} polls) ---`);
    for (const line of bot.trace.slice(-80)) console.log(line);
  }
  expect(lastPhase).toBe('complete');

  // Results banks the run, so the pad drove a complete mission end to end.
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
  const profile = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('hive-legends-profile-v1') ?? 'null')
  );
  expect(profile.missionsCompleted).toBeGreaterThanOrEqual(1);
  expect(profile.clearedLevels).toContain('brood-warrens');
  await page.screenshot({ path: 'test-results/08-gamepad-results.png' });

  // And the shell answers the pad on the way back out: (B) leaves results for
  // the wheel, and (A) there deploys the node the clear just unlocked. The
  // mission handle is deleted when a run ends, so a fresh one appearing is
  // proof both screens acted.
  await expect.poll(async () => getState(page), { timeout: 10_000 }).toBeNull();
  await driver.tap(BUTTON.b);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/09-gamepad-wheel.png' });
  await expect
    .poll(
      async () => {
        if ((await getState(page)) !== null) return true;
        await driver.tap(BUTTON.a);
        return false;
      },
      { timeout: 20_000, intervals: [250] }
    )
    .toBe(true);

  const fatal = consoleErrors.filter((error) => !error.includes('favicon'));
  expect(fatal).toEqual([]);
});

test('a gamepad plugged in mid-run takes over without a reload', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // The pad exists but is unplugged: the run starts on the keyboard.
  await installFakePad(page);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(
      async () => {
        if ((await getState(page)) !== null) return true;
        await page.keyboard.press('Enter');
        return false;
      },
      { timeout: 30_000, intervals: [250] }
    )
    .toBe(true);

  const driver = new PadDriver(page);
  const before = (await getState(page)).players[0]!.pos;

  // Plug in mid-run and push the stick. No reload, no scene restart.
  await driver.connect();
  await driver.set([0.9, 0, 0, 0], []);
  await expect
    .poll(async () => (await getState(page)).players[0]!.pos.x - before.x, { timeout: 5_000 })
    .toBeGreaterThan(8);
  await driver.release();

  // The keyboard still drives the same hero — the pad joined it, and did not
  // replace it (the merge in `PlayerCommander`).
  const afterPad = (await getState(page)).players[0]!.pos;
  await page.keyboard.down('ArrowDown');
  await expect
    .poll(async () => (await getState(page)).players[0]!.pos.y - afterPad.y, { timeout: 5_000 })
    .toBeGreaterThan(8);
  await page.keyboard.up('ArrowDown');
  await page.screenshot({ path: 'test-results/10-gamepad-hotplug.png' });

  // Sanity: the shared bot's key mapping is the one the keyboard test uses.
  expect(actionToKeys({ moveX: 1, moveY: -1, attack: true, ability: false })).toEqual([
    'ArrowRight',
    'ArrowUp',
    'Space'
  ]);

  const fatal = consoleErrors.filter((error) => !error.includes('favicon'));
  expect(fatal).toEqual([]);
});
