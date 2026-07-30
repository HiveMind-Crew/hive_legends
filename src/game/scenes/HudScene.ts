import Phaser from 'phaser';
import { audio } from '../audio';
import { playerAccent } from '../colors';
import { TEX, heroPortrait } from '../textures';
import { POWERUP_KINDS } from '../../sim/types';
import type { HudInfo, MissionScene } from './MissionScene';

/**
 * Arcade HUD (issue #4): four fixed per-player panels along the top edge —
 * accent-colored frame, portrait, large health number, rolling gold counter,
 * kills, and an ability meter with a READY! flash. Empty slots render dimmed
 * JOIN placeholders as co-op groundwork. Rendered by a parallel scene so the
 * mission camera's zoom and scroll never distort it.
 */

const SLOTS = 4;
const PANEL_W = 225;
const PANEL_H = 54;
const PANEL_GAP = 8;
const PANEL_Y = 8;
const PANELS_W = SLOTS * PANEL_W + (SLOTS - 1) * PANEL_GAP;
const LOW_HP_FRACTION = 0.3;

/** Widths of the two centred finale meters, kept out of the layout maths. */
const BOSS_BAR_W = 620;
const BOSS_BAR_INNER_W = 616;

interface Panel {
  border: Phaser.GameObjects.Rectangle;
  chip: Phaser.GameObjects.Rectangle;
  chipText: Phaser.GameObjects.Text;
  portrait: Phaser.GameObjects.Image;
  hpText: Phaser.GameObjects.Text;
  maxHpText: Phaser.GameObjects.Text;
  goldIcon: Phaser.GameObjects.Image;
  goldText: Phaser.GameObjects.Text;
  killsIcon: Phaser.GameObjects.Image;
  killsText: Phaser.GameObjects.Text;
  keyIcon: Phaser.GameObjects.Image;
  keyText: Phaser.GameObjects.Text;
  potionIcon: Phaser.GameObjects.Image;
  potionText: Phaser.GameObjects.Text;
  levelText: Phaser.GameObjects.Text;
  xpBack: Phaser.GameObjects.Rectangle;
  xpBar: Phaser.GameObjects.Rectangle;
  abilityBack: Phaser.GameObjects.Rectangle;
  abilityBar: Phaser.GameObjects.Rectangle;
  readyFlare: Phaser.GameObjects.Image;
  powerIcons: Phaser.GameObjects.Image[];
  joinText: Phaser.GameObjects.Text;
}

export class HudScene extends Phaser.Scene {
  private panels: Panel[] = [];
  private goldShown = [0, 0, 0, 0];
  private prevAbilityCd = [0, 0, 0, 0];
  private objectiveBg!: Phaser.GameObjects.Rectangle;
  private objectiveText!: Phaser.GameObjects.Text;
  private prevObjective = '';
  private pressureText!: Phaser.GameObjects.Text;
  private heraldBg!: Phaser.GameObjects.Rectangle;
  private heraldText!: Phaser.GameObjects.Text;
  private heraldQueue: { text: string; color: string }[] = [];
  private heraldBusy = false;
  private muteIcon!: Phaser.GameObjects.Text;
  private bossName!: Phaser.GameObjects.Text;
  private bossPhase!: Phaser.GameObjects.Text;
  private bossBarBack!: Phaser.GameObjects.Rectangle;
  private bossBar!: Phaser.GameObjects.Rectangle;
  private bossShown = 0; // eased bar fill, so chip damage reads as a drain
  private pauseLayer!: Phaser.GameObjects.Container;
  private pauseAudioText!: Phaser.GameObjects.Text;

  constructor() {
    super('hud');
  }

  create(): void {
    this.panels = [];
    this.goldShown = [0, 0, 0, 0];
    this.prevAbilityCd = [0, 0, 0, 0];
    this.prevObjective = '';
    this.heraldQueue = [];
    this.heraldBusy = false;
    this.drawVignette();
    for (let i = 0; i < SLOTS; i++) this.panels.push(this.buildPanel(i));

    const cx = this.scale.width / 2;

    this.objectiveBg = this.add.rectangle(cx, 78, 340, 24, 0x000000, 0.55);
    this.objectiveText = this.add
      .text(cx, 78, '', { fontFamily: 'monospace', fontSize: '15px', color: '#64e6ff', fontStyle: 'bold' })
      .setOrigin(0.5);

    // Hive-pressure readout, shown only once the hive has actually roused.
    this.pressureText = this.add
      .text(cx, 96, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ff8a7a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setVisible(false);

    // The Herald: a single announcement ribbon lower-centre. Messages queue so
    // they never overlap illegibly (issue #8).
    this.heraldBg = this.add.rectangle(cx, 150, 520, 34, 0x120c1a, 0.72).setOrigin(0.5).setVisible(false);
    this.heraldBg.setStrokeStyle(2, 0x64e6ff, 0.5);
    this.heraldText = this.add
      .text(cx, 150, '', { fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setVisible(false);

    // Boss bar (issue #25): a wide finale meter under the player panels,
    // hidden on ordinary realms.
    this.bossName = this.add
      .text(cx, 96, '', { fontFamily: 'monospace', fontSize: '17px', color: '#ff8a7a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setVisible(false);
    this.bossBarBack = this.add
      .rectangle(cx, 116, BOSS_BAR_W, 14, 0x2a1018)
      .setStrokeStyle(2, 0x7a2430)
      .setVisible(false);
    this.bossBar = this.add
      .rectangle(cx - BOSS_BAR_W / 2, 116, BOSS_BAR_INNER_W, 10, 0xd23b52)
      .setOrigin(0, 0.5)
      .setVisible(false);
    this.bossPhase = this.add
      .text(cx, 132, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffb0a0' })
      .setOrigin(0.5)
      .setVisible(false);
    this.bossShown = 1;

    // Mute indicator, bottom-right; reflects the shared audio engine state.
    this.muteIcon = this.add
      .text(this.scale.width - 12, this.scale.height - 12, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#544868'
      })
      .setOrigin(1, 1);

    this.buildPauseLayer();
  }

  /** Shows or hides the screen-space pause menu owned by the parallel HUD. */
  setRunPaused(paused: boolean): void {
    this.pauseLayer.setVisible(paused);
    if (paused) this.refreshPauseAudioCopy();
  }

  private buildPauseLayer(): void {
    const { width, height } = this.scale;
    const backdrop = this.add.rectangle(0, 0, width, height, 0x07050c, 0.82).setOrigin(0, 0);
    const panel = this.add
      .rectangle(width / 2, height / 2, 520, 300, 0x171020, 0.98)
      .setStrokeStyle(3, 0x64e6ff, 0.8);
    const title = this.add
      .text(width / 2, height / 2 - 104, 'RUN PAUSED', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: '#ffd75e',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    const subtitle = this.add
      .text(width / 2, height / 2 - 60, 'The hive waits. No time passes.', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#a89bb8'
      })
      .setOrigin(0.5);
    const resume = this.add
      .text(width / 2, height / 2, 'ESC — RESUME', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#9fe06a',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    const abandon = this.add
      .text(width / 2, height / 2 + 48, 'A — ABANDON RUN', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ff7a70'
      })
      .setOrigin(0.5);
    this.pauseAudioText = this.add
      .text(width / 2, height / 2 + 92, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#cfc4de'
      })
      .setOrigin(0.5);
    const note = this.add
      .text(width / 2, height / 2 + 122, 'Abandoning forfeits all rewards from this run.', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#756a86'
      })
      .setOrigin(0.5);

    this.pauseLayer = this.add
      .container(0, 0, [backdrop, panel, title, subtitle, resume, abandon, this.pauseAudioText, note])
      .setDepth(10_000)
      .setVisible(false);
  }

  private refreshPauseAudioCopy(): void {
    this.pauseAudioText.setText(audio.isMuted ? 'M — SOUND ON' : 'M — SOUND OFF');
  }

  /** Enqueue a Herald announcement; shown one at a time in arrival order. */
  herald(text: string, color = '#ffffff'): void {
    this.heraldQueue.push({ text, color });
    if (!this.heraldBusy) this.showNextHerald();
  }

  private showNextHerald(): void {
    const next = this.heraldQueue.shift();
    if (!next) {
      this.heraldBusy = false;
      this.heraldBg.setVisible(false);
      this.heraldText.setVisible(false);
      return;
    }
    this.heraldBusy = true;
    this.heraldText.setText(next.text).setColor(next.color).setVisible(true).setAlpha(0).setScale(0.85);
    this.heraldBg.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(next.color).color, 0.6);
    this.heraldBg.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: [this.heraldText, this.heraldBg], alpha: 1, duration: 160, ease: 'Quad.Out' });
    this.tweens.add({ targets: this.heraldText, scale: 1, duration: 220, ease: 'Back.Out' });
    this.time.delayedCall(1600, () => {
      this.tweens.add({
        targets: [this.heraldText, this.heraldBg],
        alpha: 0,
        duration: 220,
        onComplete: () => this.showNextHerald()
      });
    });
  }

  /**
   * Soft screen-edge darkening drawn in screen space (this scene sits above
   * the mission camera, so zoom/scroll never move it). Overlapping strokes
   * build the gradient without shaders.
   */
  private drawVignette(): void {
    const g = this.add.graphics().setDepth(-10);
    const w = this.scale.width;
    const h = this.scale.height;
    for (let i = 0; i < 9; i++) {
      const inset = 2 + i * 7;
      g.lineStyle(14, 0x0a0710, 0.11 * (1 - i / 9));
      g.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    }
  }

  private buildPanel(i: number): Panel {
    const x = (this.scale.width - PANELS_W) / 2 + i * (PANEL_W + PANEL_GAP);
    const y = PANEL_Y;
    const accent = playerAccent(i);
    const mono = (tx: number, ty: number, size: number, color: string, style = '') =>
      this.add.text(x + tx, y + ty, '', { fontFamily: 'monospace', fontSize: `${size}px`, color, fontStyle: style });

    this.add.rectangle(x, y, PANEL_W, PANEL_H, 0x000000, 0.55).setOrigin(0, 0);
    const border = this.add.rectangle(x, y, PANEL_W, PANEL_H).setOrigin(0, 0).setStrokeStyle(2, accent);

    const chip = this.add.rectangle(x, y, 26, 16, accent).setOrigin(0, 0);
    const chipText = mono(4, 2, 11, '#101020', 'bold');
    chipText.setText(`P${i + 1}`);

    const portrait = this.add.image(x + 24, y + 34, TEX.hero).setScale(0.9);

    const hpText = mono(46, 6, 22, '#ffffff', 'bold');
    const maxHpText = mono(112, 15, 11, '#8a8298');
    const goldIcon = this.add.image(x + 52, y + 39, TEX.uiGold);
    const goldText = mono(59, 33, 12, '#ffd75e');
    const killsIcon = this.add.image(x + 88, y + 39, TEX.uiKills);
    const killsText = mono(95, 33, 12, '#cfc4de');

    // Key tally, shown only while the party is carrying keys.
    const keyIcon = this.add.image(x + 122, y + 39, TEX.uiKey).setVisible(false);
    const keyText = mono(129, 33, 12, '#e6c34a');

    // Potion tally (bottom-centre), shown only while carrying potions.
    const potionIcon = this.add.image(x + 156, y + 39, TEX.uiPotion).setVisible(false);
    const potionText = mono(163, 33, 12, '#7be08a');

    // Hero level, tucked into the free space left of the ability meter, with
    // its progress as a thin strip along the panel's bottom edge (issue #46).
    // Deliberately clear of the gold/kills/key row, which is already crowded.
    const levelText = mono(112, 1, 11, '#ffd75e', 'bold');
    const xpBack = this.add.rectangle(x + 3, y + PANEL_H - 3, PANEL_W - 6, 3, 0x2a2438).setOrigin(0, 0.5);
    const xpBar = this.add.rectangle(x + 3, y + PANEL_H - 3, PANEL_W - 6, 3, 0xffd75e).setOrigin(0, 0.5);

    const readyFlare = this.add
      .image(x + 184, y + 12, TEX.uiAbilityReady)
      .setTint(accent)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    const abilityBack = this.add.rectangle(x + 150, y + 8, 68, 8, 0x2a2438).setOrigin(0, 0);
    const abilityBar = this.add.rectangle(x + 150, y + 8, 68, 8, accent).setOrigin(0, 0);

    const powerTextures = [TEX.uiPowerFrenzy, TEX.uiPowerSwiftness, TEX.uiPowerWard] as const;
    const powerIcons = powerTextures.map((texture, index) =>
      this.add.image(x + 190 + index * 13, y + 39, texture).setVisible(false)
    );

    const joinText = mono(PANEL_W / 2 - 24, PANEL_H / 2 - 8, 14, '#55506a');
    joinText.setText('JOIN');
    joinText.setX(x + PANEL_W / 2 - joinText.width / 2);

    return {
      border,
      chip,
      chipText,
      portrait,
      hpText,
      maxHpText,
      goldIcon,
      goldText,
      killsIcon,
      killsText,
      keyIcon,
      keyText,
      potionIcon,
      potionText,
      levelText,
      xpBack,
      xpBar,
      abilityBack,
      abilityBar,
      readyFlare,
      powerIcons,
      joinText
    };
  }

  override update(): void {
    const mission = this.scene.get('mission') as MissionScene;
    const info = mission.hudInfo();
    if (!info) return;

    for (let i = 0; i < SLOTS; i++) {
      this.updatePanel(i, info);
    }
    this.updateObjective(info);
    this.updateBossBar(info);
    // Chevrons read as a rising threat meter at a glance.
    const roused = info.pressureStage > 0 && !info.boss;
    this.pressureText.setVisible(roused);
    if (roused) this.pressureText.setText(`HIVE ROUSED ${'\u25B2'.repeat(info.pressureStage)}`);
    this.muteIcon.setText(audio.isMuted ? '♪ muted (M)' : '♪ (M)');
    if (this.pauseLayer.visible) this.refreshPauseAudioCopy();
  }

  /** The finale meter: name, eased HP drain, and the current phase title. */
  private updateBossBar(info: HudInfo): void {
    const boss = info.boss;
    const show = boss !== null;
    for (const obj of [this.bossName, this.bossBarBack, this.bossBar, this.bossPhase]) obj.setVisible(show);
    if (!boss) {
      this.bossShown = 1;
      return;
    }
    this.bossName.setText(`${boss.name.toUpperCase()} — ${boss.title.toUpperCase()}`);
    this.bossPhase.setText(boss.phaseName);
    const frac = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
    // Ease the bar toward the true value so a big hit reads as a drain.
    this.bossShown += (frac - this.bossShown) * 0.2;
    this.bossBar.width = BOSS_BAR_INNER_W * this.bossShown;
    // Recolor as she is worn down, matching the phase escalation.
    this.bossBar.setFillStyle(frac > 0.6 ? 0xd23b52 : frac > 0.25 ? 0xe0703a : 0xffb020);
  }

  private updatePanel(i: number, info: HudInfo): void {
    const panel = this.panels[i]!;
    const p = info.players[i];
    const active = p !== undefined;

    panel.joinText.setVisible(!active);
    panel.border.setAlpha(active ? 1 : 0.35);
    for (const obj of [panel.chip, panel.chipText, panel.portrait, panel.hpText, panel.maxHpText, panel.goldIcon, panel.goldText, panel.killsIcon, panel.killsText, panel.keyIcon, panel.keyText, panel.potionIcon, panel.potionText, panel.levelText, panel.xpBack, panel.xpBar, panel.abilityBack, panel.abilityBar]) {
      obj.setVisible(active);
    }
    for (const icon of panel.powerIcons) icon.setVisible(false);
    panel.readyFlare.setVisible(false);
    if (!p) return;

    // Keys only appear once the party is holding at least one.
    const hasKeys = p.keys > 0;
    panel.keyIcon.setVisible(hasKeys);
    panel.keyText.setVisible(hasKeys).setText(hasKeys ? `x${p.keys}` : '');

    // Potions likewise appear only while carried.
    const hasPotions = p.potions > 0;
    panel.potionIcon.setVisible(hasPotions);
    panel.potionText.setVisible(hasPotions).setText(hasPotions ? `x${p.potions}` : '');

    // Hero level and progress toward the next; the bar fills solid at the cap.
    panel.levelText.setText(`Lv ${p.level}`);
    const span = p.xpForLevel;
    const frac = span === null ? 1 : Math.max(0, Math.min(1, p.xpIntoLevel / span));
    panel.xpBar.width = (PANEL_W - 6) * frac;
    panel.xpBar.setFillStyle(span === null ? 0x9fe06a : 0xffd75e);

    // Large health number with a low-health pulse.
    panel.hpText.setText(String(Math.ceil(p.hp)));
    panel.maxHpText.setText(`/ ${p.maxHp}`);
    const low = p.hp / p.maxHp <= LOW_HP_FRACTION;
    panel.hpText.setColor(p.alive ? (low ? '#ff5a4d' : '#ffffff') : '#666270');
    panel.hpText.setScale(low && p.alive ? 1 + 0.06 * Math.sin(this.time.now / 90) : 1);
    if (panel.portrait.texture.key !== heroPortrait(p.heroId)) panel.portrait.setTexture(heroPortrait(p.heroId));
    panel.portrait.setTint(p.alive ? 0xffffff : 0x555555);

    // Gold counter rolls up toward the real value.
    const shown = this.goldShown[i]!;
    if (shown !== p.gold) {
      const diff = p.gold - shown;
      this.goldShown[i] = Math.abs(diff) <= 1 ? p.gold : shown + Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.18));
    }
    panel.goldText.setText(String(this.goldShown[i]));
    panel.killsText.setText(String(p.kills));

    // Active temporary buffs occupy fixed silhouette-coded chips. Their
    // opacity drains during the final second so expiry reads without text.
    for (let powerIndex = 0; powerIndex < POWERUP_KINDS.length; powerIndex++) {
      const kind = POWERUP_KINDS[powerIndex]!;
      const ticks = p.power[kind];
      panel.powerIcons[powerIndex]!.setVisible(ticks > 0).setAlpha(Math.min(1, 0.35 + ticks / 60));
    }

    // Ability meter: while a guard stance is up it doubles as the stance
    // duration meter (steel, draining); otherwise it fills as the cooldown
    // recovers and flashes READY! at full.
    if (p.guardTicks > 0 && p.guardMax > 0) {
      panel.abilityBar.width = 68 * Math.max(0, Math.min(1, p.guardTicks / p.guardMax));
      panel.abilityBar.setFillStyle(0xc2c8d2);
    } else {
      const frac = p.abilityMax > 0 ? Math.max(0, Math.min(1, 1 - p.abilityCooldown / p.abilityMax)) : 1;
      panel.abilityBar.width = 68 * frac;
      panel.abilityBar.setFillStyle(p.abilityCooldown === 0 ? playerAccent(i) : 0x6a6480);
    }
    const ready = p.guardTicks === 0 && p.abilityCooldown === 0;
    panel.readyFlare.setVisible(ready).setAlpha(ready ? 0.45 + Math.sin(this.time.now / 130) * 0.25 : 0);
    if (this.prevAbilityCd[i]! > 0 && p.abilityCooldown === 0) this.readyFlash(panel.abilityBack.x + 34, panel.abilityBack.y + 4);
    this.prevAbilityCd[i] = p.abilityCooldown;
  }

  private updateObjective(info: HudInfo): void {
    // On a boss realm the finale bar carries the objective, so the ribbon
    // steps aside rather than reading "BROOD NODES: 0".
    const label =
      info.phase === 'combat'
        ? info.boss
          ? ''
          : `BROOD NODES: ${info.generatorsLeft}`
        : info.phase === 'exit-open'
          ? 'FIND THE EXIT!'
          : '';
    this.objectiveBg.setVisible(label !== '');
    this.objectiveText.setVisible(label !== '');
    if (label !== this.prevObjective) {
      this.prevObjective = label;
      this.objectiveText.setText(label);
      this.objectiveText.setColor(info.phase === 'exit-open' ? '#ffd75e' : '#64e6ff');
      // Pop animation on every objective change — the future chime hook.
      this.objectiveText.setScale(1.35);
      this.tweens.add({ targets: this.objectiveText, scale: 1, duration: 220, ease: 'Back.Out' });
    }
  }

  private readyFlash(x: number, y: number): void {
    const flare = this.add
      .image(x, y, TEX.uiAbilityReady)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.7);
    const t = this.add
      .text(x, y, 'READY!', { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScale(0.5);
    this.tweens.add({
      targets: [flare, t],
      scale: 1.3,
      y: y - 14,
      alpha: 0,
      duration: 600,
      onComplete: () => {
        flare.destroy();
        t.destroy();
      }
    });
  }

  /** Full-screen mission-end banner, shown before the results transition. */
  banner(text: string, color: string): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.45);
    const t = this.add
      .text(width / 2, height / 2 - 20, text, {
        fontFamily: 'monospace',
        fontSize: '46px',
        color,
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setScale(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 300, ease: 'Back.Out' });
  }
}
