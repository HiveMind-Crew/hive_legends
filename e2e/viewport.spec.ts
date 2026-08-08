import { expect, test } from '@playwright/test';
import { getState } from './bot';

/**
 * Canvas scaling (issue #94).
 *
 * The game is authored at a fixed 960x720 and every scene lays out against
 * that constant, so the only thing standing between it and an arbitrary window
 * is the scale manager. Before `Scale.FIT` landed there was none: the canvas
 * was emitted at its native size into a `overflow: hidden` body, so anything
 * outside a 960x720 window was cut off and unreachable — the HUD panels at
 * y = 8 and the key-hint footers at height - 80 went first.
 *
 * These are the assertions that would have failed then and pass now: at every
 * window size the whole canvas is inside the viewport, its aspect ratio is
 * untouched, and it is centred. "The whole canvas is visible" is the real
 * claim, because with FIT nothing inside the canvas can be clipped
 * independently of it.
 */

/** The design resolution declared in src/main.ts. */
const BASE_W = 960;
const BASE_H = 720;
const ASPECT = BASE_W / BASE_H;

const VIEWPORTS = [
  { name: 'smaller than native in both axes', width: 1024, height: 640 },
  { name: 'shorter than native', width: 1280, height: 600 },
  { name: 'exactly native', width: BASE_W, height: BASE_H },
  { name: 'larger than native', width: 1600, height: 1000 }
];

for (const vp of VIEWPORTS) {
  test(`the canvas fits and stays centred in a viewport ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // The scale manager sizes the canvas on a resize event, which can land a
    // frame after the element appears, so poll rather than sampling once.
    const box = await expect
      .poll(async () => (await canvas.boundingBox())?.width ?? 0, { timeout: 10_000, intervals: [100] })
      .toBeGreaterThan(0)
      .then(() => canvas.boundingBox());
    expect(box).not.toBeNull();
    const { x, y, width, height } = box!;

    // Nothing hangs off any edge. A single px of tolerance for sub-pixel
    // rounding in the scale manager's margins.
    expect(x).toBeGreaterThanOrEqual(-1);
    expect(y).toBeGreaterThanOrEqual(-1);
    expect(x + width).toBeLessThanOrEqual(vp.width + 1);
    expect(y + height).toBeLessThanOrEqual(vp.height + 1);

    // The 4:3 design resolution is preserved — FIT letterboxes, it never
    // stretches. (A RESIZE mode would fail this, and would also hand the
    // scenes a logical size their fixed layouts are not built for.)
    expect(width / height).toBeCloseTo(ASPECT, 1);

    // It fills the axis it is constrained by, rather than sitting at native
    // size in a large window or overflowing a small one.
    const expectedScale = Math.min(vp.width / BASE_W, vp.height / BASE_H);
    expect(width).toBeCloseTo(BASE_W * expectedScale, 0);
    expect(height).toBeCloseTo(BASE_H * expectedScale, 0);

    // Centred: the letterbox bars are even on both axes.
    expect(x).toBeCloseTo((vp.width - width) / 2, 0);
    expect(y).toBeCloseTo((vp.height - height) / 2, 0);

    // The drawing buffer keeps the design resolution regardless of CSS size,
    // which is what lets every scene keep laying out against 960x720.
    const buffer = await canvas.evaluate((el) => ({
      w: (el as HTMLCanvasElement).width,
      h: (el as HTMLCanvasElement).height
    }));
    expect(buffer).toEqual({ w: BASE_W, h: BASE_H });
  });
}

test('the canvas re-fits when the window is resized mid-session', async ({ page }) => {
  // Dragging the window is the common case, and it is served by a different
  // code path from the initial fit: Phaser's scale manager polls the parent
  // element from inside the game loop rather than reacting to the initial
  // layout. Worth its own assertion — the loop only runs while the page is
  // foregrounded, so this is not observable in a backgrounded preview.
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

  const fittedWidth = async (): Promise<number> =>
    (await page.locator('canvas').boundingBox())?.width ?? 0;

  await expect.poll(fittedWidth, { timeout: 10_000 }).toBeCloseTo(BASE_W * (640 / BASE_H), 0);

  // Grow the window; the canvas should follow within the scale manager's
  // parent-poll interval rather than staying at the old size.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect.poll(fittedWidth, { timeout: 10_000 }).toBeCloseTo(BASE_W * (1000 / BASE_H), 0);

  // And shrink it back.
  await page.setViewportSize({ width: 800, height: 600 });
  await expect.poll(fittedWidth, { timeout: 10_000 }).toBeCloseTo(800, 0);

  const box = (await page.locator('canvas').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(801);
  expect(box.y + box.height).toBeLessThanOrEqual(601);
});

test('the solo mission HUD keeps its authored composition through representative FIT sizes', async ({ page }) => {
  await page.setViewportSize({ width: BASE_W, height: BASE_H });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

  // Retry confirm through hero select and the mission wheel; a press can land
  // while BootScene is still generating textures on a loaded worker.
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

  for (const viewport of [
    { name: 'native', width: BASE_W, height: BASE_H },
    { name: 'smaller', width: 1024, height: 640 },
    { name: 'larger', width: 1600, height: 1000 }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const expectedScale = Math.min(viewport.width / BASE_W, viewport.height / BASE_H);
    const canvas = page.locator('canvas');
    await expect
      .poll(async () => (await canvas.boundingBox())?.width ?? 0, { timeout: 10_000 })
      .toBeCloseTo(BASE_W * expectedScale, 0);

    const buffer = await canvas.evaluate((element) => ({
      width: (element as HTMLCanvasElement).width,
      height: (element as HTMLCanvasElement).height
    }));
    expect(buffer).toEqual({ width: BASE_W, height: BASE_H });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `test-results/issue144-solo-hud-${viewport.name}.png` });
  }
});
