import type { Page } from '@playwright/test';
import type { BotAction } from './bot';

export const BUTTON = { a: 0, b: 1, x: 2, back: 8, start: 9 } as const;

declare global {
  interface Window {
    __hivePads: {
      connect: (slot: number) => void;
      disconnect: (slot: number) => void;
      set: (slot: number, axes: number[], pressed: number[]) => void;
    };
  }
}

export async function installFakePads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pads = Array.from({ length: 4 }, (_, index) => {
      const pad = {
        id: `Hive Legends Test Pad ${index + 1} (STANDARD GAMEPAD)`,
        index,
        connected: false,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }))
      };
      Object.defineProperty(pad, 'timestamp', { get: () => performance.now() });
      return pad;
    });
    window.__hivePads = {
      connect: (slot: number) => {
        const pad = pads[slot];
        if (pad) pad.connected = true;
      },
      disconnect: (slot: number) => {
        const pad = pads[slot];
        if (pad) pad.connected = false;
      },
      set: (slot: number, axes: number[], pressed: number[]) => {
        const pad = pads[slot];
        if (!pad) return;
        pad.axes = axes;
        pad.buttons.forEach((button, index) => {
          const down = pressed.includes(index);
          button.pressed = down;
          button.value = down ? 1 : 0;
        });
      }
    };
    navigator.getGamepads = (): (Gamepad | null)[] =>
      pads.map((pad) => (pad.connected ? (pad as unknown as Gamepad) : null));
  });
}

export class PadDriver {
  constructor(
    private page: Page,
    private slot: number
  ) {}

  connect(): Promise<void> {
    return this.page.evaluate((slot) => window.__hivePads.connect(slot), this.slot);
  }

  disconnect(): Promise<void> {
    return this.page.evaluate((slot) => window.__hivePads.disconnect(slot), this.slot);
  }

  set(axes: number[], pressed: number[]): Promise<void> {
    return this.page.evaluate(
      ([slot, nextAxes, nextPressed]) => window.__hivePads.set(slot as number, nextAxes as number[], nextPressed as number[]),
      [this.slot, axes, pressed] as const
    );
  }

  release(): Promise<void> {
    return this.set([0, 0, 0, 0], []);
  }

  async tap(button: number): Promise<void> {
    await this.set([0, 0, 0, 0], [button]);
    await this.page.waitForTimeout(120);
    await this.release();
    await this.page.waitForTimeout(120);
  }

  play(action: BotAction): Promise<void> {
    const pressed = [...(action.attack ? [BUTTON.a] : []), ...(action.ability ? [BUTTON.x] : [])];
    return this.set([action.moveX * 0.85, action.moveY * 0.85, 0, 0], pressed);
  }
}
