import Phaser from 'phaser';
import { CONTENT, LEVELS } from '../../content';
import {
  bestClearTicks,
  loadProfile,
  masteredHeroes,
  nodeLockState,
  spokeProgress,
  suggestedNode,
  type Profile
} from '../../meta/save';
import { bestClearCopy } from '../clearTimes';
import { endOfContentCopy, statusCopy } from '../hubCopy';
import {
  hexPoints,
  hubMapLayout,
  hubNodePosition,
  hubTeaserPosition,
  navigationHint,
  nodeNameLabel,
  nodeVisual,
  type HubMapLayout
} from '../hubLayout';
import { audio } from '../audio';
import { FULLSCREEN_HINT, bindFullscreenToggle } from '../fullscreen';
import { bindPadMenu } from '../padMenu';
import { TEX } from '../textures';

/**
 * The mission map: authored spokes become resin rails and honeycomb cells,
 * while all state and identity still come from CONTENT/LEVELS and save.ts.
 * This scene owns presentation only; adding a realm remains a content edit.
 */

const COLOR = {
  cleared: 0x9fe06a,
  available: 0xffd75e,
  locked: 0x554a68,
  boss: 0xe0524d,
  ink: 0x120c1a,
  panel: 0x1a1526
} as const;

interface WheelNode {
  spokeId: string;
  spokeName: string;
  levelId: string;
  /** -1 for the spoke's boss. */
  index: number;
  ordinal: number;
  isBoss: boolean;
  x: number;
  y: number;
  accent: number;
}

interface RenderedNodeCounts {
  labelCount: number;
  stateCount: number;
}

export class MissionHubScene extends Phaser.Scene {
  private profile!: Profile;
  private layout!: HubMapLayout;
  private nodes: WheelNode[] = [];
  private cursor = 0;
  private heroId = 'vanguard';
  private realmName!: Phaser.GameObjects.Text;
  private realmProgress!: Phaser.GameObjects.Text;
  private infoName!: Phaser.GameObjects.Text;
  private infoStatus!: Phaser.GameObjects.Text;
  private infoAction!: Phaser.GameObjects.Text;
  /** Cells, glyphs, labels, and the selection mark are redrawn on refresh. */
  private dynamicObjects: Phaser.GameObjects.GameObject[] = [];
  private renderedNodeCounts = new Map<string, RenderedNodeCounts>();

  constructor() {
    super('mission-hub');
  }

  create(data?: { heroId?: string; levelId?: string }): void {
    const { width, height } = this.scale;
    this.profile = loadProfile();
    this.heroId = data?.heroId && CONTENT.heroes[data.heroId] ? data.heroId : 'vanguard';
    this.layout = hubMapLayout(width, height);

    this.cameras.main.setBackgroundColor('#0a0a12');
    this.drawAmbient(width, height);
    this.drawMapBackground();
    this.drawTeasers();
    // Phaser reuses this scene instance across scene.start(), so authored
    // nodes must be rebuilt from scratch for each visit.
    this.nodes = [];
    this.drawSpokes();
    this.drawHub();
    this.drawEndOfContent();

    // Park the cursor on whatever the player should play next, so a single
    // confirm always does the obvious thing (and the e2e default holds).
    const suggested = data?.levelId ?? suggestedNode(this.profile).levelId;
    const found = this.nodes.findIndex((n) => n.levelId === suggested);
    this.cursor = found >= 0 ? found : 0;

    this.drawChrome(width, height);
    this.refresh();
    this.bindKeys();

    const hubDebugHandle = {
      getState: () => {
        const node = this.nodes[this.cursor];
        const counts = node ? this.renderedNodeCounts.get(node.levelId) : undefined;
        return {
          authoredNodeCount: CONTENT.spokes.reduce((total, spoke) => total + spoke.missions.length + 1, 0),
          nodeCount: this.nodes.length,
          selectedIndex: this.cursor,
          selectedLevelId: node?.levelId ?? null,
          selectedLabel: this.infoName.text,
          selectedStatus: this.infoStatus.text,
          selectedAction: this.infoAction.text,
          selectedLabelCount: counts?.labelCount ?? 0,
          selectedStateCount: counts?.stateCount ?? 0
        };
      }
    };
    (globalThis as Record<string, unknown>).__hiveHub = hubDebugHandle;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if ((globalThis as Record<string, unknown>).__hiveHub === hubDebugHandle) delete (globalThis as Record<string, unknown>).__hiveHub;
    });
  }

  // --- drawing -------------------------------------------------------------

  private drawAmbient(width: number, height: number): void {
    this.add.particles(0, 0, TEX.mote, {
      x: { min: 0, max: width },
      y: height + 10,
      lifespan: { min: 8000, max: 12000 },
      speedY: { min: -18, max: -8 },
      speedX: { min: -5, max: 5 },
      scale: { start: 1, end: 0.3 },
      alpha: { start: 0.35, end: 0 },
      tint: [0x4aa3ff, 0xa855c8],
      frequency: 200
    });
  }

  private drawMapBackground(): void {
    const { left, right, top, bottom } = this.layout;
    this.add
      .rectangle((left + right) / 2, (top + bottom) / 2, right - left, bottom - top, COLOR.ink, 0.92)
      .setStrokeStyle(2, 0x3b2b4f, 0.9);
    this.add.rectangle((left + right) / 2, top + 3, right - left - 32, 2, 0x64e6ff, 0.28);

    // A quiet honeycomb field gives the map a place-like texture without
    // competing with the authored route or its labels.
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x553a67, 0.16);
    const radius = 25;
    const columnStep = radius * 1.9;
    const rowStep = radius * 1.58;
    for (let row = 0; row < 7; row++) {
      for (let column = 0; column < 11; column++) {
        const x = left + 30 + column * columnStep + (row % 2 ? radius * 0.95 : 0);
        const y = top + 32 + row * rowStep;
        if (x < right - 24 && y < bottom - 18) grid.strokePoints(hexPoints(radius, x, y), true, true);
      }
    }

    this.add
      .text(left + 24, top + 14, 'LIVE ROUTE  //  HIVE CHART', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#716280'
      })
      .setOrigin(0, 0.5);
  }

  private drawHub(): void {
    const { centerX, centerY } = this.layout;
    this.add
      .image(centerX, centerY, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0x4aa3ff)
      .setScale(3.1)
      .setAlpha(0.2);
    this.addHex(centerX, centerY + 5, 43, 0x0d0a15, 0.98, 0x6f92c9, 0.9, 2);
    this.addHex(centerX, centerY, 37, 0x1a1526, 0.95, 0x4aa3ff, 0.65, 1);
    this.add
      .text(centerX, centerY - 4, 'HIVE', { fontFamily: 'monospace', fontSize: '13px', color: '#f4e3b2' })
      .setOrigin(0.5);
    this.add
      .text(centerX, centerY + 15, 'ORIGIN', { fontFamily: 'monospace', fontSize: '8px', color: '#6f92c9' })
      .setOrigin(0.5);
  }

  /** Keep the edge-of-content state visible whenever a player revisits. */
  private drawEndOfContent(): void {
    const end = endOfContentCopy(this.profile);
    if (!end) return;
    this.add
      .text(this.layout.centerX, this.layout.bottom - 18, end.line, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#c9a227'
      })
      .setOrigin(0.5);
  }

  /** Announced-but-unauthored branches remain dim, named, and clearly future. */
  private drawTeasers(): void {
    const { centerX, centerY } = this.layout;
    for (const teaser of CONTENT.teaserSpokes) {
      const end = hubTeaserPosition(teaser.angleDeg, this.layout);
      this.add
        .line(0, 0, centerX, centerY, end.x, end.y, teaser.accent, 0.18)
        .setOrigin(0, 0)
        .setLineWidth(4);
      this.addHex(end.x, end.y + 4, 29, COLOR.ink, 0.85, teaser.accent, 0.22, 1);
      this.add
        .text(end.x, end.y - 1, '?', { fontFamily: 'monospace', fontSize: '20px', color: '#5b5170' })
        .setOrigin(0.5);
      this.add
        .text(end.x, end.y + 39, teaser.name, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#655a76',
          align: 'center'
        })
        .setOrigin(0.5);
      this.add
        .text(end.x, end.y + 55, 'FUTURE REALM', {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#514760'
        })
        .setOrigin(0.5);
    }
  }

  private drawSpokes(): void {
    for (const spoke of CONTENT.spokes) {
      const levelIds = [...spoke.missions, spoke.boss];
      const positions = levelIds.map((_, ordinal) => hubNodePosition(spoke.angleDeg, ordinal, levelIds.length, this.layout));
      const last = positions[positions.length - 1];
      if (!last) continue;

      // A broad under-rail plus a bright core makes a route feel physical;
      // honeycomb cells then sit into it like stations along a resin trail.
      this.add
        .line(0, 0, this.layout.centerX, this.layout.centerY, last.x, last.y, spoke.accent, 0.16)
        .setOrigin(0, 0)
        .setLineWidth(13);
      this.add
        .line(0, 0, this.layout.centerX, this.layout.centerY, last.x, last.y, spoke.accent, 0.65)
        .setOrigin(0, 0)
        .setLineWidth(3);

      for (let ordinal = 0; ordinal < positions.length - 1; ordinal++) {
        const position = positions[ordinal]!;
        this.add.circle(position.x, position.y, 5, spoke.accent, 0.75);
      }

      levelIds.forEach((levelId, ordinal) => {
        const position = positions[ordinal]!;
        this.nodes.push({
          spokeId: spoke.id,
          spokeName: spoke.name,
          levelId,
          index: ordinal < spoke.missions.length ? ordinal : -1,
          ordinal,
          isBoss: ordinal >= spoke.missions.length,
          x: position.x,
          y: position.y,
          accent: spoke.accent
        });
      });
    }
  }

  private drawChrome(width: number, height: number): void {
    this.add
      .text(width / 2, 29, 'MISSION MAP', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#ffd75e',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 59, 'TRACE THE RESIN TRAIL  ·  CHOOSE YOUR NEXT DESCENT', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#a89bb8'
      })
      .setOrigin(0.5);

    this.realmName = this.add
      .text(58, 90, '', { fontFamily: 'monospace', fontSize: '16px', color: '#f4e3b2', fontStyle: 'bold' })
      .setOrigin(0, 0.5);
    this.realmProgress = this.add
      .text(width - 58, 90, '', { fontFamily: 'monospace', fontSize: '12px', color: '#9fe06a' })
      .setOrigin(1, 0.5);

    const footerTop = height - 174;
    this.add
      .rectangle(width / 2, footerTop + 61, width - 80, 122, COLOR.panel, 0.96)
      .setStrokeStyle(1, 0x544868, 0.95);
    this.infoName = this.add
      .text(width / 2, footerTop + 18, '', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#f4e3b2',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.infoStatus = this.add
      .text(width / 2, footerTop + 47, '', { fontFamily: 'monospace', fontSize: '12px', color: '#64e6ff' })
      .setOrigin(0.5);
    this.infoAction = this.add
      .text(width / 2, footerTop + 77, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffd75e' })
      .setOrigin(0.5);

    const controls = `${navigationHint(CONTENT.spokes.length)}   ${FULLSCREEN_HINT}   ·   Pad: (A) deploy (B) back`;
    this.add
      .text(width / 2, height - 18, controls, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#7a6f92'
      })
      .setOrigin(0.5);
  }

  /** Phaser-free hex geometry is shared with the map grid and node cells. */
  private addHex(
    x: number,
    y: number,
    radius: number,
    fill: number,
    fillAlpha: number,
    stroke: number,
    strokeAlpha: number,
    lineWidth: number
  ): Phaser.GameObjects.Graphics {
    const graphic = this.add.graphics();
    graphic.fillStyle(fill, fillAlpha);
    graphic.fillPoints(hexPoints(radius, x, y), true, true);
    graphic.lineStyle(lineWidth, stroke, strokeAlpha);
    graphic.strokePoints(hexPoints(radius, x, y), true, true);
    return graphic;
  }

  /** Redraw cell state, identity, and selection copy together. */
  private refresh(): void {
    for (const object of this.dynamicObjects) object.destroy();
    this.dynamicObjects = [];
    this.renderedNodeCounts.clear();

    this.nodes.forEach((node, index) => this.drawNode(node, index === this.cursor));

    const node = this.nodes[this.cursor];
    if (!node) return;
    const lock = nodeLockState(this.profile, node.levelId);
    const progress = spokeProgress(this.profile, node.spokeId);
    const mastery = masteredHeroes(this.profile, node.levelId).length;
    const masteryTotal = Object.keys(CONTENT.heroes).length;
    const label = LEVELS[node.levelId]?.name ?? node.levelId;
    const best = bestClearCopy(bestClearTicks(this.profile, node.levelId));
    const visual = nodeVisual(lock, node.isBoss);

    this.realmName.setText(node.spokeName.toUpperCase());
    this.realmName.setColor(Phaser.Display.Color.IntegerToColor(node.accent).rgba);
    this.realmProgress.setText(`${progress.cleared}/${progress.total} MISSIONS CLEARED   ·   ${node.isBoss ? 'BOSS NODE' : 'ROUTE IN PROGRESS'}`);
    this.infoName.setText(`${node.isBoss ? '☠  ' : ''}${label}${best ? `   ${best}` : ''}`);
    this.infoStatus
      .setText(`${node.spokeName}   ·   ${progress.cleared}/${progress.total} cleared   ·   Mastery ${mastery}/${masteryTotal}   ·   ${statusCopy(lock)}`)
      .setColor(lock.state === 'locked' ? '#c86a7a' : lock.state === 'cleared' ? '#9fe06a' : '#64e6ff');
    const action = lock.state === 'locked' ? statusCopy(lock) : lock.state === 'cleared' ? 'ENTER  ·  replay this mission' : 'ENTER  ·  deploy to this mission';
    this.infoAction.setText(`${visual.stateLabel}   ·   ${action}`).setColor(lock.state === 'locked' ? '#c86a7a' : lock.state === 'cleared' ? '#9fe06a' : '#ffd75e');
  }

  private drawNode(node: WheelNode, selected: boolean): void {
    const lock = nodeLockState(this.profile, node.levelId);
    const visual = nodeVisual(lock, node.isBoss);
    const radius = node.isBoss ? 34 : 27;
    const baseColor = lock.state === 'cleared' ? COLOR.cleared : lock.state === 'available' ? COLOR.available : COLOR.panel;
    const strokeColor = lock.state === 'locked' ? COLOR.locked : node.isBoss ? COLOR.boss : node.accent;
    const strokeAlpha = lock.state === 'locked' ? 0.85 : 1;

    this.dynamicObjects.push(this.addHex(node.x, node.y + 5, radius, 0x0d0912, 0.95, COLOR.ink, 0.9, 2));
    this.dynamicObjects.push(this.addHex(node.x, node.y, radius, baseColor, lock.state === 'locked' ? 0.82 : 0.9, strokeColor, strokeAlpha, node.isBoss ? 3 : 2));
    if (node.isBoss) this.dynamicObjects.push(this.addHex(node.x, node.y, radius + 7, COLOR.ink, 0, COLOR.boss, lock.state === 'locked' ? 0.35 : 0.7, 1));
    if (selected) this.dynamicObjects.push(this.addHex(node.x, node.y, radius + 11, COLOR.ink, 0, 0xffffff, 0.95, 2));

    const glyph = this.add
      .text(node.x, node.y - 1, visual.glyph, {
        fontFamily: 'monospace',
        fontSize: node.isBoss ? '22px' : '18px',
        color: lock.state === 'locked' ? '#756a85' : '#17131f',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.dynamicObjects.push(glyph);

    // Labels stay adjacent to their authored bearing. The right-side default
    // keeps the vertical first spoke legible while later spokes can naturally
    // use the opposite side when their angle points left.
    const spoke = CONTENT.spokes.find((candidate) => candidate.id === node.spokeId);
    const bearing = spoke?.angleDeg ?? 0;
    const labelSide = Math.sin((bearing * Math.PI) / 180) < -0.05 ? -1 : 1;
    const labelX = node.x + labelSide * (radius + 18);
    const panelX = labelX + labelSide * 112;
    const panelColor = lock.state === 'locked' ? 0x16111f : node.accent;
    const panel = this.add
      .rectangle(panelX, node.y, 224, 42, panelColor, selected ? 0.25 : 0.15)
      .setStrokeStyle(1, selected ? 0xffffff : strokeColor, selected ? 0.75 : 0.45);
    this.dynamicObjects.push(panel);

    const name = this.add
      .text(labelX, node.y - 9, nodeNameLabel(LEVELS[node.levelId]?.name ?? node.levelId, node.ordinal, node.isBoss), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: lock.state === 'locked' ? '#91869e' : '#f4e3b2'
      })
      .setOrigin(labelSide > 0 ? 0 : 1, 0.5);
    this.dynamicObjects.push(name);
    const state = this.add
      .text(labelX, node.y + 10, `${selected ? '◆ SELECTED   ·   ' : ''}${visual.stateLabel}`, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: lock.state === 'locked' ? '#c86a7a' : lock.state === 'cleared' ? '#9fe06a' : '#ffd75e'
      })
      .setOrigin(labelSide > 0 ? 0 : 1, 0.5);
    this.dynamicObjects.push(state);

    const counts = this.renderedNodeCounts.get(node.levelId) ?? { labelCount: 0, stateCount: 0 };
    counts.labelCount += 1;
    counts.stateCount += 1;
    this.renderedNodeCounts.set(node.levelId, counts);
  }

  // --- input ---------------------------------------------------------------

  private bindKeys(): void {
    const kb = this.input.keyboard;
    const step = (delta: number): void => {
      this.cursor = (this.cursor + delta + this.nodes.length) % this.nodes.length;
      audio.uiTick(delta > 0 ? 620 : 520);
      this.refresh();
    };
    // Along a spoke.
    kb?.on('keydown-DOWN', () => step(1));
    kb?.on('keydown-UP', () => step(-1));
    kb?.on('keydown-S', () => step(1));
    kb?.on('keydown-W', () => step(-1));

    // Between spokes: land on the next realm's first mission. The authored
    // spoke count controls whether this legend is advertised at all.
    const spokeIds = [...new Set(this.nodes.map((n) => n.spokeId))];
    const jump = (delta: number): void => {
      if (spokeIds.length < 2) {
        audio.uiTick(200);
        return;
      }
      const current = this.nodes[this.cursor];
      if (!current) return;
      const here = spokeIds.indexOf(current.spokeId);
      const next = spokeIds[(here + delta + spokeIds.length) % spokeIds.length]!;
      this.cursor = this.nodes.findIndex((n) => n.spokeId === next);
      audio.uiTick(delta > 0 ? 620 : 520);
      this.refresh();
    };
    kb?.on('keydown-RIGHT', () => jump(1));
    kb?.on('keydown-LEFT', () => jump(-1));
    kb?.on('keydown-D', () => jump(1));
    kb?.on('keydown-A', () => jump(-1));

    bindFullscreenToggle(this);
    const openSettings = (): void => {
      audio.unlock();
      audio.uiConfirm();
      this.scene.launch('settings', { returnScene: 'mission-hub' });
      this.scene.pause();
    };
    const toHeroSelect = (): void => {
      audio.unlock();
      audio.uiConfirm();
      this.scene.start('hero-select', { heroId: this.heroId });
    };
    const deploy = (): void => {
      audio.unlock();
      const node = this.nodes[this.cursor];
      if (!node) return;
      if (nodeLockState(this.profile, node.levelId).state === 'locked') {
        audio.uiTick(200);
        return;
      }
      audio.uiConfirm();
      this.scene.start('mission', { heroId: this.heroId, levelId: node.levelId });
    };
    kb?.on('keydown-O', openSettings);
    kb?.on('keydown-H', toHeroSelect);
    kb?.on('keydown-ENTER', deploy);
    bindPadMenu(this, {
      down: () => step(1),
      up: () => step(-1),
      right: () => jump(1),
      left: () => jump(-1),
      confirm: deploy,
      cancel: toHeroSelect,
      menu: openSettings
    });
  }
}
