import Phaser from 'phaser';
import { loadProfile, resetProfile, saveReduceMotion } from '../../meta/save';
import { audio } from '../audio';
import { bindFullscreenToggle } from '../fullscreen';
import { bindPadMenu } from '../padMenu';
import { masterVolumePercent, stepMasterVolume } from '../settings';
import { TEX } from '../textures';

type SettingsReturnScene = 'hero-select' | 'mission' | 'mission-hub' | 'results';

interface SettingsData {
  returnScene?: SettingsReturnScene;
}

/** Shared settings screen, opened over a paused shell or mission scene. */
export class SettingsScene extends Phaser.Scene {
  private returnScene: SettingsReturnScene = 'hero-select';
  private volumeFill!: Phaser.GameObjects.Rectangle;
  private volumeText!: Phaser.GameObjects.Text;
  private muteText!: Phaser.GameObjects.Text;
  private motionText!: Phaser.GameObjects.Text;
  private resetPrompt!: Phaser.GameObjects.Container;
  private confirmingReset = false;
  private reduceMotion = false;

  constructor() {
    super('settings');
  }

  create(data?: SettingsData): void {
    const { width, height } = this.scale;
    this.returnScene = data?.returnScene ?? 'hero-select';
    this.confirmingReset = false;
    this.reduceMotion = loadProfile().reduceMotion;

    this.cameras.main.setBackgroundColor('#0a0a12');
    this.add.rectangle(0, 0, width, height, 0x0a0710).setOrigin(0, 0);
    this.add
      .image(width / 2, height / 2, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0x64e6ff)
      .setScale(12, 8)
      .setAlpha(0.12);

    this.add
      .text(width / 2, 92, 'SETTINGS', {
        fontFamily: 'monospace',
        fontSize: '38px',
        color: '#ffd75e',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 136, 'Tune the hive to your comfort.', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#a89bb8'
      })
      .setOrigin(0.5);

    this.add.rectangle(width / 2, 312, 620, 250, 0x171020, 0.96).setStrokeStyle(2, 0x544868);
    this.add
      .text(width / 2, 218, 'MASTER VOLUME', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#f4e3b2',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.add.rectangle(width / 2, 264, 480, 24, 0x2a2438).setStrokeStyle(1, 0x756a86);
    this.volumeFill = this.add.rectangle(width / 2 - 238, 264, 476, 20, 0x64e6ff).setOrigin(0, 0.5);
    this.volumeText = this.add
      .text(width / 2, 302, '', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#64e6ff'
      })
      .setOrigin(0.5);
    this.muteText = this.add
      .text(width / 2, 354, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#cfc4de'
      })
      .setOrigin(0.5);
    this.motionText = this.add
      .text(width / 2, 404, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#cfc4de'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 486, 'R — RESET ALL PROGRESS', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ff7a70'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 532, 'ESC — BACK', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#9fe06a'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height - 74, '← → volume     M sound     A reduce motion     F fullscreen', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#756a86'
      })
      .setOrigin(0.5);

    this.buildResetPrompt(width, height);
    this.refresh();
    this.bindKeys();
    bindFullscreenToggle(this);

    (globalThis as Record<string, unknown>).__hiveSettings = {
      getState: () => ({
        volume: audio.masterVolume,
        muted: audio.isMuted,
        reduceMotion: this.reduceMotion,
        confirmingReset: this.confirmingReset,
        returnScene: this.returnScene
      })
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      delete (globalThis as Record<string, unknown>).__hiveSettings;
    });
  }

  private buildResetPrompt(width: number, height: number): void {
    const shade = this.add.rectangle(0, 0, width, height, 0x050308, 0.88).setOrigin(0, 0);
    const panel = this.add.rectangle(width / 2, height / 2, 610, 250, 0x21121c).setStrokeStyle(3, 0xff5a4d);
    const title = this.add
      .text(width / 2, height / 2 - 72, 'ERASE YOUR LEGACY?', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ff7a70',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    const warning = this.add
      .text(width / 2, height / 2 - 20, 'Gold, clears, heroes, weapons, XP, and settings will be reset.', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#cfc4de',
        align: 'center',
        wordWrap: { width: 540 }
      })
      .setOrigin(0.5);
    const controls = this.add
      .text(width / 2, height / 2 + 60, 'ENTER — CONFIRM     ESC — CANCEL', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#f4e3b2'
      })
      .setOrigin(0.5);
    this.resetPrompt = this.add.container(0, 0, [shade, panel, title, warning, controls]).setDepth(100).setVisible(false);
  }

  private bindKeys(): void {
    const kb = this.input.keyboard;
    const adjust = (direction: -1 | 1): void => {
      if (this.confirmingReset) return;
      const next = stepMasterVolume(audio.masterVolume, direction);
      audio.setVolume(next);
      audio.uiTick(420 + masterVolumePercent(next) * 4);
      this.refresh();
    };
    const toggleMute = (): void => {
      if (this.confirmingReset) return;
      audio.toggleMute();
      this.refresh();
    };
    const toggleReduceMotion = (): void => {
      if (this.confirmingReset) return;
      this.reduceMotion = !this.reduceMotion;
      saveReduceMotion(this.reduceMotion);
      this.game.events.emit('reduce-motion-changed', this.reduceMotion);
      audio.uiTick(this.reduceMotion ? 360 : 620);
      this.refresh();
    };
    kb?.on('keydown-LEFT', () => adjust(-1));
    kb?.on('keydown-RIGHT', () => adjust(1));
    kb?.on('keydown-M', toggleMute);
    kb?.on('keydown-A', toggleReduceMotion);
    kb?.on('keydown-R', () => {
      if (this.confirmingReset) return;
      this.confirmingReset = true;
      this.resetPrompt.setVisible(true);
      audio.uiTick(240);
    });
    const confirm = (): void => {
      if (this.confirmingReset) this.confirmReset();
    };
    const cancel = (): void => {
      if (this.confirmingReset) {
        this.confirmingReset = false;
        this.resetPrompt.setVisible(false);
        audio.uiTick(420);
      } else {
        this.close();
      }
    };
    kb?.on('keydown-ENTER', confirm);
    kb?.on('keydown-ESC', cancel);
    // Pad (issue #98). Profile reset stays keyboard-only on purpose: it is the
    // one irreversible action in the game, and it should not sit one stray
    // face-button press away — but its confirm prompt must be answerable by
    // whoever opened it, so confirm and cancel are bound.
    bindPadMenu(this, {
      left: () => adjust(-1),
      right: () => adjust(1),
      alt: toggleMute,
      alt2: toggleReduceMotion,
      confirm,
      cancel,
      menu: cancel
    });
  }

  private refresh(): void {
    const percent = masterVolumePercent(audio.masterVolume);
    this.volumeFill.width = 476 * (percent / 100);
    this.volumeText.setText(`←  ${percent}%  →`);
    this.muteText
      .setText(audio.isMuted ? 'M — SOUND MUTED' : 'M — SOUND ON')
      .setColor(audio.isMuted ? '#ff7a70' : '#9fe06a');
    this.motionText
      .setText(this.reduceMotion ? 'A — REDUCED MOTION ON' : 'A — REDUCED MOTION OFF')
      .setColor(this.reduceMotion ? '#9fe06a' : '#cfc4de');
  }

  private close(): void {
    audio.uiConfirm();
    this.scene.resume(this.returnScene);
    this.scene.stop();
  }

  private confirmReset(): void {
    const profile = resetProfile();
    // Keep the already-created audio engine aligned with the fresh profile.
    audio.setPreferences(profile.volume, profile.muted);
    audio.stopMusic();
    delete (globalThis as Record<string, unknown>).__hive;

    for (const key of ['hud', 'mission', 'mission-hub', 'results', 'hero-select']) {
      this.scene.stop(key);
    }
    this.scene.start('hero-select');
  }
}
