import Phaser from 'phaser';
import { audio } from '../audio';
import { playerAccent } from '../colors';
import { TEX, heroPortrait } from '../textures';
import { POWERUP_KINDS } from '../../sim/types';
import {
  HUD_BOSS_STATUS_WIDTH,
  HUD_PANEL_HEIGHT,
  HUD_STATUS_HEIGHT,
  HUD_STATUS_WIDTH,
  MAX_PLAYERS,
  panelLayout
} from '../hudLayout';
import { heroLevelCopy } from '../xpCopy';
import { missionControlsText } from '../tutorialCopy';
import type { HudInfo, MissionScene } from './MissionScene';

/**
 * Arcade HUD (issue #4): compact per-player panels at the top corners — accent-
 * colored frame, portrait, large health number, rolling gold counter, kills,
 * and an ability meter with a READY! flash. Rendered by a parallel scene so the
 * mission camera's zoom and scroll never distort it.
 *
 * Panels are built from the live joined count. Explicit join/drop-out reflows
 * shallow side stacks while a broad centre lane stays open for the objective
 * and the battlefield. The bottom JOIN affordance keeps open pad slots
 * discoverable without reserving empty panels. Geometry and its conservative
 * obstruction budget live in `src/game/hudLayout.ts` and are unit-tested.
 */

const LOW_HP_FRACTION = 0.3;
const ABILITY_W = 63;

/** Widths of the two centred finale meters, kept out of the layout maths. */
const BOSS_BAR_W = HUD_BOSS_STATUS_WIDTH;
const BOSS_BAR_INNER_W = BOSS_BAR_W - 4;

interface Panel {
  slot: number;
  objects: Phaser.GameObjects.GameObject[];
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
  /** This panel's own width; the layout gives wider panels to smaller parties. */
  width: number;
}

export class HudScene extends Phaser.Scene {
  private panels: Panel[] = [];
  private goldShown: number[] = [];
  private prevAbilityCd: number[] = [];
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
  /** Continue prompt (issue #99), shown only while a fallen run is deciding. */
  private continueLayer!: Phaser.GameObjects.Container;
  private continueTitle!: Phaser.GameObjects.Text;
  private continueOffer!: Phaser.GameObjects.Text;
  private continueAction!: Phaser.GameObjects.Text;
  private continueBarBack!: Phaser.GameObjects.Rectangle;
  private continueBar!: Phaser.GameObjects.Rectangle;
  private joinText!: Phaser.GameObjects.Text;

  constructor() {
    super('hud');
  }

  create(data?: { playerCount?: number }): void {
    // The party size comes from the mission's SimState, so the bar has no
    // opinion of its own about how many players there are.
    const count = Math.max(1, Math.min(MAX_PLAYERS, data?.playerCount ?? 1));
    this.panels = [];
    this.goldShown = new Array<number>(MAX_PLAYERS).fill(0);
    this.prevAbilityCd = new Array<number>(MAX_PLAYERS).fill(0);
    this.prevObjective = '';
    this.heraldQueue = [];
    this.heraldBusy = false;
    this.drawVignette();
    this.rebuildPanels(Array.from({ length: count }, (_, slot) => slot));

    const cx = this.scale.width / 2;

    this.objectiveBg = this.add.rectangle(cx, 18, HUD_STATUS_WIDTH, HUD_STATUS_HEIGHT, 0x000000, 0.55);
    this.objectiveText = this.add
      .text(cx, 18, '', { fontFamily: 'monospace', fontSize: '14px', color: '#64e6ff', fontStyle: 'bold' })
      .setOrigin(0.5);

    // Hive-pressure readout, shown only once the hive has actually roused.
    this.pressureText = this.add
      .text(cx, 36, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ff8a7a', fontStyle: 'bold' })
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

    // Boss bar (issue #25): a wide finale meter between the panel columns,
    // hidden on ordinary realms.
    this.bossName = this.add
      .text(cx, 10, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ff8a7a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setVisible(false);
    this.bossBarBack = this.add
      .rectangle(cx, 28, BOSS_BAR_W, 12, 0x2a1018)
      .setStrokeStyle(2, 0x7a2430)
      .setVisible(false);
    this.bossBar = this.add
      .rectangle(cx - BOSS_BAR_W / 2, 28, BOSS_BAR_INNER_W, 8, 0xd23b52)
      .setOrigin(0, 0.5)
      .setVisible(false);
    this.bossPhase = this.add
      .text(cx, 41, '', { fontFamily: 'monospace', fontSize: '10px', color: '#ffb0a0' })
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

    this.joinText = this.add
      .text(12, this.scale.height - 12, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#7a6f92'
      })
      .setOrigin(0, 1);

    this.buildPauseLayer();
    this.buildContinueLayer();
  }

  /** Shows or hides the screen-space pause menu owned by the parallel HUD. */
  setRunPaused(paused: boolean): void {
    this.pauseLayer.setVisible(paused);
  }

  private buildPauseLayer(): void {
    const { width, height } = this.scale;
    const backdrop = this.add.rectangle(0, 0, width, height, 0x07050c, 0.82).setOrigin(0, 0);
    const panel = this.add
      .rectangle(width / 2, height / 2, 660, 520, 0x171020, 0.98)
      .setStrokeStyle(3, 0x64e6ff, 0.8);
    const title = this.add
      .text(width / 2, height / 2 - 220, 'RUN PAUSED', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: '#ffd75e',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    const subtitle = this.add
      .text(width / 2, height / 2 - 180, 'The hive waits. No time passes.', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#a89bb8'
      })
      .setOrigin(0.5);
    const controlsTitle = this.add
      .text(width / 2, height / 2 - 138, 'CONTROLS                 KEYBOARD              GAMEPAD', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#64e6ff',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    const controls = this.add
      .text(width / 2, height / 2 - 106, missionControlsText(), {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#e7e0ef',
        lineSpacing: 8
      })
      .setOrigin(0.5, 0);
    const resume = this.add
      .text(width / 2, height / 2 + 62, 'ESC / START — RESUME', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#9fe06a',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    const abandon = this.add
      .text(width / 2, height / 2 + 112, 'A / PAD B — ABANDON RUN', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ff7a70'
      })
      .setOrigin(0.5);
    const settings = this.add
      .text(width / 2, height / 2 + 154, 'S / PAD X — SETTINGS', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#cfc4de'
      })
      .setOrigin(0.5);
    const note = this.add
      .text(width / 2, height / 2 + 204, 'Abandoning forfeits all rewards from this run.', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#756a86'
      })
      .setOrigin(0.5);

    this.pauseLayer = this.add
      .container(0, 0, [backdrop, panel, title, subtitle, controlsTitle, controls, resume, abandon, settings, note])
      .setDepth(10_000)
      .setVisible(false);
  }

  /**
   * The continue prompt (issue #99). Drawn here rather than in MissionScene
   * because the mission camera zooms and scrolls; the HUD scene is the one
   * that renders in screen space.
   */
  private buildContinueLayer(): void {
    const { width, height } = this.scale;
    const backdrop = this.add.rectangle(0, 0, width, height, 0x120508, 0.84).setOrigin(0, 0);
    const panel = this.add
      .rectangle(width / 2, height / 2, 620, 250, 0x1c1018, 0.98)
      .setStrokeStyle(3, 0xff5a4d, 0.9);
    this.continueTitle = this.add
      .text(width / 2, height / 2 - 74, '', {
        fontFamily: 'monospace',
        fontSize: '38px',
        color: '#ffd75e',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.continueOffer = this.add
      .text(width / 2, height / 2 - 12, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#f4e3b2'
      })
      .setOrigin(0.5);
    this.continueAction = this.add
      .text(width / 2, height / 2 + 46, '', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#64e6ff'
      })
      .setOrigin(0.5);
    // The countdown bar is the arcade tell: the decision is on a clock.
    this.continueBarBack = this.add.rectangle(width / 2, height / 2 + 88, 460, 10, 0x2a2438);
    this.continueBar = this.add.rectangle(width / 2 - 230, height / 2 + 88, 460, 10, 0xff7a70).setOrigin(0, 0.5);

    this.continueLayer = this.add
      .container(0, 0, [
        backdrop,
        panel,
        this.continueTitle,
        this.continueOffer,
        this.continueAction,
        this.continueBarBack,
        this.continueBar
      ])
      .setDepth(10_001)
      .setVisible(false);
  }

  /** Shows/updates the continue prompt. `fraction` is the countdown remaining. */
  showContinue(title: string, offer: string, action: string, fraction: number): void {
    this.continueTitle.setText(title);
    this.continueOffer.setText(offer);
    this.continueAction.setText(action);
    this.continueBar.width = 460 * Math.max(0, Math.min(1, fraction));
    this.continueLayer.setVisible(true);
  }

  hideContinue(): void {
    this.continueLayer.setVisible(false);
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

  /**
   * Builds one dense panel. The first line is identity, HP, level, and ability;
   * the second is resources and temporary effects; XP owns the bottom rule.
   */
  private buildPanel(slot: number, x: number, y: number, w: number): Panel {
    const accent = playerAccent(slot);
    const mono = (tx: number, ty: number, size: number, color: string, style = '') =>
      this.add.text(x + tx, y + ty, '', { fontFamily: 'monospace', fontSize: `${size}px`, color, fontStyle: style });

    const background = this.add.rectangle(x, y, w, HUD_PANEL_HEIGHT, 0x000000, 0.55).setOrigin(0, 0);
    const border = this.add.rectangle(x, y, w, HUD_PANEL_HEIGHT).setOrigin(0, 0).setStrokeStyle(2, accent);

    const chip = this.add.rectangle(x, y, 24, 14, accent).setOrigin(0, 0);
    const chipText = mono(3, 1, 10, '#101020', 'bold');
    chipText.setText(`P${slot + 1}`);

    const portrait = this.add.image(x + 17, y + 27, TEX.hero).setScale(0.7);

    const hpText = mono(34, 2, 17, '#ffffff', 'bold');
    const maxHpText = mono(77, 8, 9, '#8a8298');
    const goldIcon = this.add.image(x + 41, y + 28, TEX.uiGold);
    const goldText = mono(48, 22, 10, '#ffd75e');
    const killsIcon = this.add.image(x + 70, y + 28, TEX.uiKills);
    const killsText = mono(77, 22, 10, '#cfc4de');

    // Key tally, shown only while the party is carrying keys.
    const keyIcon = this.add.image(x + 99, y + 28, TEX.uiKey).setVisible(false);
    const keyText = mono(106, 22, 10, '#e6c34a');

    // Potion tally (bottom-centre), shown only while carrying potions.
    const potionIcon = this.add.image(x + 128, y + 28, TEX.uiPotion).setVisible(false);
    const potionText = mono(135, 22, 10, '#7be08a');

    // Hero level, tucked into the free space left of the ability meter, with
    // its progress as a thin strip along the panel's bottom edge (issue #46).
    // Deliberately clear of the gold/kills/key row, which is already crowded.
    const levelText = mono(107, 2, 10, '#ffd75e', 'bold');
    const xpBack = this.add.rectangle(x + 3, y + HUD_PANEL_HEIGHT - 3, w - 6, 3, 0x2a2438).setOrigin(0, 0.5);
    const xpBar = this.add.rectangle(x + 3, y + HUD_PANEL_HEIGHT - 3, w - 6, 3, 0xffd75e).setOrigin(0, 0.5);

    const readyFlare = this.add
      .image(x + 173.5, y + 9, TEX.uiAbilityReady)
      .setScale(ABILITY_W / 68, 0.75)
      .setTint(accent)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    const abilityBack = this.add.rectangle(x + 142, y + 6, ABILITY_W, 7, 0x2a2438).setOrigin(0, 0);
    const abilityBar = this.add.rectangle(x + 142, y + 6, ABILITY_W, 7, accent).setOrigin(0, 0);

    const powerTextures = [TEX.uiPowerFrenzy, TEX.uiPowerSwiftness, TEX.uiPowerWard] as const;
    const powerIcons = powerTextures.map((texture, index) =>
      this.add.image(x + 178 + index * 12, y + 28, texture).setVisible(false)
    );

    const objects: Phaser.GameObjects.GameObject[] = [
      background,
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
      ...powerIcons
    ];
    return {
      slot,
      objects,
      width: w,
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
      powerIcons
    };
  }

  override update(): void {
    const mission = this.scene.get('mission') as MissionScene;
    const info = mission.hudInfo();
    if (!info) return;

    this.syncPartyPanels(info);
    for (let i = 0; i < this.panels.length; i++) {
      this.updatePanel(i, info);
    }
    this.updateObjective(info);
    this.updateBossBar(info);
    // Chevrons read as a rising threat meter at a glance.
    const roused = info.pressureStage > 0 && !info.boss;
    this.pressureText.setVisible(roused);
    if (roused) this.pressureText.setText(`HIVE ROUSED ${'\u25B2'.repeat(info.pressureStage)}`);
    this.muteIcon.setText(audio.isMuted ? '♪ muted' : '♪');
  }

  /** Reflows the top bar only when explicit participation changed. */
  private syncPartyPanels(info: HudInfo): void {
    const slots = info.players.map((p) => p.slot);
    if (slots.length !== this.panels.length || slots.some((slot, i) => this.panels[i]?.slot !== slot)) {
      this.rebuildPanels(slots);
    }
    const joined = new Set(slots);
    const open = Array.from({ length: MAX_PLAYERS }, (_, slot) => slot).filter((slot) => !joined.has(slot));
    const join = open.length > 0 ? `${open.map((slot) => `P${slot + 1}`).join('/')} START TO JOIN` : 'PARTY FULL';
    this.joinText.setText(`${join}   •   BACK DROP OUT   •   HOLD (B) / E REVIVE`);
  }

  private rebuildPanels(slots: readonly number[]): void {
    for (const panel of this.panels) for (const object of panel.objects) object.destroy();
    this.panels = [];
    const safeSlots = slots.length > 0 ? slots : [0];
    const layout = panelLayout(safeSlots.length, this.scale.width);
    layout.placements.forEach(({ x, y }, index) => {
      this.panels.push(this.buildPanel(safeSlots[index] ?? index, x, y, layout.width));
    });
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

    // A panel only exists for a player who is in the run, so `active` is a
    // guard against a mid-run party change rather than an empty-slot state.
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

    // Hero level and progress toward the next. At the cap the bar fills solid
    // and the chip says MAX (issue #103) — a full bar alone read as "nearly
    // there" for the rest of the player's time with the game.
    const span = p.xpForLevel;
    const atCap = span === null;
    panel.levelText.setText(heroLevelCopy(p.level, atCap));
    panel.levelText.setColor(atCap ? '#9fe06a' : '#ffd75e');
    const frac = atCap ? 1 : Math.max(0, Math.min(1, p.xpIntoLevel / span));
    panel.xpBar.width = (panel.width - 6) * frac;
    panel.xpBar.setFillStyle(atCap ? 0x9fe06a : 0xffd75e);

    // Large health number with a low-health pulse.
    const revivePercent = Math.floor((p.reviveProgress / Math.max(1, p.reviveRequired)) * 100);
    panel.hpText.setText(p.alive ? String(Math.ceil(p.hp)) : `DOWN ${revivePercent}%`);
    panel.maxHpText.setText(p.alive ? `/ ${p.maxHp}` : 'HOLD REVIVE');
    const low = p.hp / p.maxHp <= LOW_HP_FRACTION;
    panel.hpText.setColor(p.alive ? (low ? '#ff5a4d' : '#ffffff') : '#666270');
    panel.hpText.setScale(low && p.alive ? 1 + 0.06 * Math.sin(this.time.now / 90) : 1);
    if (panel.portrait.texture.key !== heroPortrait(p.heroId)) panel.portrait.setTexture(heroPortrait(p.heroId));
    panel.portrait.setTint(p.alive ? 0xffffff : 0x555555);

    // Gold counter rolls up toward the real value.
    const shown = this.goldShown[p.slot]!;
    if (shown !== p.gold) {
      const diff = p.gold - shown;
      this.goldShown[p.slot] =
        Math.abs(diff) <= 1 ? p.gold : shown + Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.18));
    }
    panel.goldText.setText(String(this.goldShown[p.slot]));
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
      panel.abilityBar.width = ABILITY_W * Math.max(0, Math.min(1, p.guardTicks / p.guardMax));
      panel.abilityBar.setFillStyle(0xc2c8d2);
    } else {
      const frac = p.abilityMax > 0 ? Math.max(0, Math.min(1, 1 - p.abilityCooldown / p.abilityMax)) : 1;
      panel.abilityBar.width = ABILITY_W * frac;
      panel.abilityBar.setFillStyle(p.abilityCooldown === 0 ? playerAccent(p.slot) : 0x6a6480);
    }
    const ready = p.guardTicks === 0 && p.abilityCooldown === 0;
    panel.readyFlare.setVisible(ready).setAlpha(ready ? 0.45 + Math.sin(this.time.now / 130) * 0.25 : 0);
    if (this.prevAbilityCd[p.slot]! > 0 && p.abilityCooldown === 0) {
      this.readyFlash(panel.abilityBack.x + ABILITY_W / 2, panel.abilityBack.y + 3.5);
    }
    this.prevAbilityCd[p.slot] = p.abilityCooldown;
  }

  private updateObjective(info: HudInfo): void {
    // On a boss realm the finale bar carries the objective, so the ribbon
    // steps aside rather than reading "SPAWNERS: 0".
    const label =
      info.phase === 'combat'
        ? info.boss
          ? ''
          : `SPAWNERS: ${info.generatorsLeft}`
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
