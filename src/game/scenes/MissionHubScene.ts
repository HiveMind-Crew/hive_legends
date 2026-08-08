import Phaser from 'phaser';
import { CONTENT, LEVELS } from '../../content';
import { loadProfile, suggestedNode, type Profile } from '../../meta/save';
import { audio } from '../audio';
import { bestClearCopy } from '../clearTimes';
import { endOfContentCopy } from '../hubCopy';
import { FULLSCREEN_HINT, bindFullscreenToggle } from '../fullscreen';
import { floorVariant } from '../environmentTextures';
import { MenuSelection } from '../menuSelection';
import { bindPadMenu } from '../padMenu';
import { missionHubItems, spokeProgressCopy, type MissionHubItem } from '../hubViewModel';
import { generatorFrame, bossFrame, TEX } from '../textures';
import { upgradeShopEntry, UPGRADE_ROUTE_LABEL } from '../upgradeRoute';

/**
 * The mission map is a route rail plus one selected destination card. The
 * profile/content rules remain in meta/content; this scene only renders them
 * and routes every input device through MenuSelection.
 */

const COLOR = {
  background: 0x080811,
  ink: 0x100b18,
  panel: 0x1a1526,
  panelHi: 0x221a30,
  amber: 0xffd75e,
  cyan: 0x64e6ff,
  green: 0x9fe06a,
  red: 0xe0524d,
  violet: 0xa855c8,
  lilac: 0xc0b3ce,
  dim: 0xa194b3,
  parchment: 0xf4e3b2
} as const;

interface RenderedNodeCounts {
  labelCount: number;
  nameCount: number;
  stateCount: number;
}

export class MissionHubScene extends Phaser.Scene {
  private profile!: Profile;
  private items: MissionHubItem[] = [];
  private selection!: MenuSelection;
  private heroId = 'vanguard';
  private dynamicObjects: Phaser.GameObjects.GameObject[] = [];
  private renderedNodeCounts = new Map<string, RenderedNodeCounts>();
  private toastText!: Phaser.GameObjects.Text;
  private realmTitle!: Phaser.GameObjects.Text;
  private realmName!: Phaser.GameObjects.Text;
  private realmSubtitle!: Phaser.GameObjects.Text;
  private realmProgress!: Phaser.GameObjects.Text;

  constructor() {
    super('mission-hub');
  }

  create(data?: { heroId?: string; levelId?: string }): void {
    const { width, height } = this.scale;
    this.profile = loadProfile();
    this.heroId = data?.heroId && CONTENT.heroes[data.heroId] ? data.heroId : 'vanguard';
    this.items = missionHubItems(this.profile);
    const suggested = data?.levelId ?? suggestedNode(this.profile).levelId;
    const suggestedIndex = Math.max(0, this.items.findIndex((item) => item.levelId === suggested));
    this.selection = new MenuSelection([this.items.length], suggestedIndex);

    this.cameras.main.setBackgroundColor('#080811');
    this.drawBackground(width, height);
    this.drawHeader(width);
    this.drawRailChrome();
    this.drawTeaserLine(width);
    this.toastText = this.add
      .text(width / 2, height - 11, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#64e6ff',
        align: 'center'
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.refresh();
    this.bindKeys();

    const hubDebugHandle = {
      getState: () => {
        const item = this.items[this.selection.selectedIndex];
        const counts = item ? this.renderedNodeCounts.get(item.levelId) : undefined;
        return {
          authoredNodeCount: CONTENT.spokes.reduce((total, spoke) => total + spoke.missions.length + 1, 0),
          nodeCount: this.items.length,
          selectedIndex: this.selection.selectedIndex,
          selectedLevelId: item?.levelId ?? null,
          selectedLabel: item?.name ?? '',
          selectedStatus: item?.rowCopy ?? '',
          selectedAction: item?.state === 'locked' ? item.rowCopy : item?.state === 'cleared' ? 'REPLAY' : 'DEPLOY',
          heroId: this.heroId,
          upgradeRouteLabel: UPGRADE_ROUTE_LABEL,
          selectedLabelCount: counts?.labelCount ?? 0,
          selectedNameCount: counts?.nameCount ?? 0,
          selectedStateCount: counts?.stateCount ?? 0
        };
      }
    };
    (globalThis as Record<string, unknown>).__hiveHub = hubDebugHandle;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if ((globalThis as Record<string, unknown>).__hiveHub === hubDebugHandle) delete (globalThis as Record<string, unknown>).__hiveHub;
    });
  }

  private drawBackground(width: number, height: number): void {
    this.add.rectangle(width / 2, height / 2, width, height, COLOR.background, 1);
    this.add.tileSprite(width / 2, height / 2, width, height, TEX.floor).setAlpha(0.11).setTint(0x4b3560);
    this.add
      .rectangle(width / 2, height / 2, width - 2, height - 2, COLOR.background, 0)
      .setStrokeStyle(1, COLOR.violet, 0.28);
    this.add
      .image(width / 2, height / 2, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(COLOR.violet)
      .setScale(12, 8)
      .setAlpha(0.08);
  }

  private drawHeader(width: number): void {
    this.realmTitle = this.add
      .text(30, 31, '', {
        fontFamily: 'sans-serif',
        fontSize: '23px',
        color: '#ffd75e',
        fontStyle: 'bold'
      })
      .setOrigin(0, 0.5);
    this.realmSubtitle = this.add
      .text(30, 61, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#a194b3'
      })
      .setOrigin(0, 0.5);
    this.realmName = this.add
      .text(width - 30, 31, 'HIVE FRONTIER', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#a194b3'
      })
      .setOrigin(1, 0.5);
    this.realmProgress = this.add
      .text(width - 30, 61, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#9fe06a'
      })
      .setOrigin(1, 0.5);
  }

  private drawTeaserLine(width: number): void {
    const teasers = CONTENT.teaserSpokes.map((teaser) => teaser.name).join('  ·  ');
    const edge = endOfContentCopy(this.profile);
    this.add
      .text(width - 30, 84, edge ? edge.line : `FUTURE FRONTIERS  ·  ${teasers.toUpperCase()}`, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#716280'
      })
      .setOrigin(1, 0.5);
  }

  private drawRailChrome(): void {
    this.add
      .rectangle(214, 397, 366, 558, COLOR.ink, 0.82)
      .setStrokeStyle(1, 0x3b2b4f, 0.85)
      .setOrigin(0.5);
    const progressX = 31;
    const segmentWidth = 77;
    this.items.forEach((item, index) => {
      const segment = this.add.rectangle(progressX + segmentWidth / 2 + index * (segmentWidth + 5), 103, segmentWidth, 7, COLOR.panelHi, 0.9);
      segment.setStrokeStyle(1, item.state === 'cleared' ? COLOR.green : item.isBoss ? COLOR.red : COLOR.lilac, 0.35);
      if (item.state === 'cleared') segment.setFillStyle(COLOR.green, 0.85);
    });
    this.add
      .rectangle(31, 663, 366, 45, COLOR.ink, 0.72)
      .setStrokeStyle(1, COLOR.cyan, 0.18)
      .setOrigin(0, 0);
    this.add
      .text(44, 686, `↑↓/WS MOVE   ENTER/A DEPLOY   ${FULLSCREEN_HINT.toUpperCase()}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#a194b3'
      })
      .setOrigin(0, 0.5);
  }

  private refresh(): void {
    for (const object of this.dynamicObjects) object.destroy();
    this.dynamicObjects = [];
    this.renderedNodeCounts.clear();
    this.selection.setRows([this.items.length]);
    this.renderRows();
    this.renderDetail();
  }

  private renderRows(): void {
    const rowTop = 120;
    const rowBottom = 646;
    const gap = 9;
    const height = Math.min(118, (rowBottom - rowTop - gap * (this.items.length - 1)) / this.items.length);
    const itemHeight = Math.max(54, height);
    this.items.forEach((item, index) => {
      const y = rowTop + (itemHeight + gap) * index + itemHeight / 2;
      const selected = index === this.selection.selectedIndex;
      const fill = item.state === 'locked' ? 0x17111f : COLOR.panelHi;
      const border = selected ? COLOR.cyan : item.state === 'cleared' ? COLOR.green : item.state === 'locked' ? COLOR.red : 0x6f5e81;
      const background = this.add.rectangle(31, y, 366, itemHeight, fill, 0.94).setOrigin(0, 0.5);
      background.setStrokeStyle(selected ? 2 : 1, border, selected ? 1 : 0.5);
      background.setInteractive({ useHandCursor: true });
      background.on('pointerover', () => this.selectIndex(index, false));
      background.on('pointerdown', () => this.confirmSelected());
      this.dynamicObjects.push(background);

      const accent = this.add.rectangle(31, y, 4, itemHeight, border, 1).setOrigin(0, 0.5);
      this.dynamicObjects.push(accent);
      const glyph = item.state === 'locked' ? '☠' : item.state === 'cleared' ? '✓' : '▶';
      const glyphText = this.add
        .text(60, y - 2, glyph, {
          fontFamily: 'sans-serif',
          fontSize: '19px',
          color: item.state === 'locked' ? '#e0524d' : item.state === 'cleared' ? '#9fe06a' : '#ffd75e',
          fontStyle: 'bold'
        })
        .setOrigin(0.5);
      this.dynamicObjects.push(glyphText);

      const ordinal = item.isBoss ? 'BOSS' : `MISSION ${item.ordinal + 1}`;
      const ordinalText = this.add
        .text(91, y - (itemHeight >= 90 ? 37 : 17), ordinal, { fontFamily: 'monospace', fontSize: '11px', color: '#a194b3' })
        .setOrigin(0, 0.5);
      const nameText = this.add
        .text(91, y - (itemHeight >= 90 ? 11 : 1), item.name, {
          fontFamily: 'sans-serif',
          fontSize: itemHeight >= 90 ? '16px' : '12px',
          color: '#f4e3b2',
          fontStyle: 'bold',
          wordWrap: { width: 270 }
        })
        .setOrigin(0, 0.5);
      const stateText = this.add
        .text(91, y + (itemHeight >= 90 ? 19 : 18), this.rowCopy(item), {
          fontFamily: 'monospace',
          fontSize: itemHeight < 80 ? '10px' : '11px',
          color: item.state === 'locked' ? '#eaa7a3' : item.state === 'cleared' ? '#b2df91' : '#c8bdd3',
          wordWrap: { width: 270 }
        })
        .setOrigin(0, 0.5);
      this.dynamicObjects.push(ordinalText, nameText, stateText);
      const counts = this.renderedNodeCounts.get(item.levelId) ?? { labelCount: 0, nameCount: 0, stateCount: 0 };
      counts.labelCount += 1;
      counts.nameCount += 1;
      counts.stateCount += 1;
      this.renderedNodeCounts.set(item.levelId, counts);
    });
  }

  private rowCopy(item: MissionHubItem): string {
    if (item.state === 'locked') return item.rowCopy;
    return item.state === 'cleared' ? 'CLEARED  ·  REPLAYABLE' : 'READY  ·  DEPLOYABLE';
  }

  private renderDetail(): void {
    const item = this.items[this.selection.selectedIndex];
    if (!item) return;
    const level = LEVELS[item.levelId]!;
    const progress = spokeProgressCopy(this.profile, item.spokeId);
    const panel = this.add
      .rectangle(418, 100, 512, 596, COLOR.panel, 0.97)
      .setStrokeStyle(1, 0x544868, 0.95)
      .setOrigin(0, 0);
    this.dynamicObjects.push(panel);

    const texture = floorVariant(0, level.theme?.tileSet);
    const biome = this.add.tileSprite(436, 120, 476, 236, texture).setOrigin(0, 0).setTint(level.theme?.accent ?? 0x8a5fc9);
    this.dynamicObjects.push(biome);
    const shade = this.add.rectangle(436, 120, 476, 236, COLOR.ink, 0.38).setOrigin(0, 0);
    this.dynamicObjects.push(shade);
    const subjectKey = level.boss ? bossFrame(level.boss.typeId, 0) : generatorFrame(level.generators[0]?.typeId ?? 'brood-node', 0);
    const subject = this.add.image(830, 247, subjectKey).setScale(level.boss ? 1.4 : 1.7).setDepth(2);
    this.dynamicObjects.push(subject);
    const biomeLabel = this.add
      .text(451, 337, item.biomeLabel, { fontFamily: 'monospace', fontSize: '12px', color: '#64e6ff', fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setDepth(3);
    this.dynamicObjects.push(biomeLabel);

    const name = this.add
      .text(436, 385, item.name, { fontFamily: 'sans-serif', fontSize: '25px', color: '#f4e3b2', fontStyle: 'bold' })
      .setOrigin(0, 0.5);
    this.dynamicObjects.push(name);

    const firstFact = item.bestTicks !== null ? bestClearCopy(item.bestTicks) : `${item.firstClearBounty}g`;
    const firstLabel = item.bestTicks !== null ? 'PERSONAL BEST' : 'FIRST-CLEAR BOUNTY';
    this.addDetailStat(436, 422, firstFact, firstLabel);
    this.addDetailStat(591, 422, `${item.masteryCount}/${item.masteryTotal}`, 'HEROES MASTERED');
    this.addDetailStat(748, 422, this.threatGlyphs(item.threatRating), `${item.threatLabel} THREAT`);

    const encounterLabel = this.add
      .text(436, 473, 'ENCOUNTERS', { fontFamily: 'monospace', fontSize: '10px', color: '#a194b3' })
      .setOrigin(0, 0.5);
    this.dynamicObjects.push(encounterLabel);
    let encounterX = 519;
    item.encounters.forEach((encounter) => {
      const chip = this.add
        .text(encounterX, 473, encounter, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#d8cee4',
          backgroundColor: '#241d31',
          padding: { left: 8, right: 8, top: 4, bottom: 4 }
        })
        .setOrigin(0, 0.5);
      this.dynamicObjects.push(chip);
      encounterX += chip.width + 7;
    });

    let noteY = 520;
    if (item.state === 'locked') {
      const lock = this.add
        .text(436, noteY, item.rowCopy, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#f0b5b1',
          backgroundColor: '#35171f',
          padding: { left: 9, right: 9, top: 6, bottom: 6 },
          wordWrap: { width: 456 }
        })
        .setOrigin(0, 0);
      this.dynamicObjects.push(lock);
      noteY += 42;
    }
    const description = this.add
      .text(436, noteY, item.description, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#c0b3ce',
        wordWrap: { width: 452 },
        lineSpacing: 5
      })
      .setOrigin(0, 0);
    this.dynamicObjects.push(description);

    const deploy = this.makeButton(436, 650, 158, 40, item.state === 'locked' ? 'LOCKED' : item.state === 'cleared' ? 'REPLAY' : 'DEPLOY', item.state === 'locked' ? COLOR.red : COLOR.amber, () => this.confirmSelected());
    const heroSelect = this.makeButton(604, 650, 133, 40, 'HERO SELECT', COLOR.lilac, () => this.toHeroSelect());
    const upgrades = this.makeButton(747, 650, 165, 40, UPGRADE_ROUTE_LABEL, COLOR.cyan, () => this.openUpgrades());
    this.dynamicObjects.push(deploy, heroSelect, upgrades);

    this.realmTitle.setText(item.spokeName.toUpperCase());
    const spokeIndex = CONTENT.spokes.findIndex((spoke) => spoke.id === item.spokeId);
    this.realmSubtitle.setText(`REALM ${spokeIndex + 1} OF ${CONTENT.spokes.length}  ·  ${item.state === 'locked' ? 'ROUTE LOCKED' : 'ROUTE IN PROGRESS'}`);
    this.realmProgress.setText(progress);
  }

  private addDetailStat(x: number, y: number, value: string, label: string): void {
    const stat = this.add
      .text(x, y, value, { fontFamily: 'monospace', fontSize: '15px', color: '#eee6f5', fontStyle: 'bold' })
      .setOrigin(0, 0.5);
    const caption = this.add
      .text(x, y + 23, label, { fontFamily: 'monospace', fontSize: '9px', color: '#a194b3' })
      .setOrigin(0, 0.5);
    this.dynamicObjects.push(stat, caption);
  }

  private threatGlyphs(rating: number): string {
    return `${'▼'.repeat(Math.max(0, Math.min(5, rating)))}${'▽'.repeat(Math.max(0, 5 - rating))}`;
  }

  private makeButton(x: number, y: number, width: number, height: number, label: string, color: number, onConfirm: () => void): Phaser.GameObjects.Rectangle {
    const button = this.add.rectangle(x, y, width, height, COLOR.ink, 0.92).setOrigin(0, 0.5);
    button.setStrokeStyle(1, color, 0.8).setInteractive({ useHandCursor: true });
    button.on('pointerdown', onConfirm);
    const text = this.add
      .text(x + width / 2, y, label, { fontFamily: 'monospace', fontSize: '11px', color: Phaser.Display.Color.IntegerToColor(color).rgba, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.dynamicObjects.push(text);
    return button;
  }

  private selectIndex(index: number, playSound: boolean): void {
    if (index === this.selection.selectedIndex) return;
    this.selection.pointer({ row: 0, col: index });
    if (playSound) audio.uiTick();
    this.refresh();
  }

  private move(direction: 'up' | 'down'): void {
    this.selection.move(direction);
    audio.uiTick(direction === 'down' ? 620 : 520);
    this.refresh();
  }

  private jumpSpoke(delta: number): void {
    const spokeIds = [...new Set(this.items.map((item) => item.spokeId))];
    if (spokeIds.length < 2) {
      audio.uiTick(200);
      return;
    }
    const current = this.items[this.selection.selectedIndex]!;
    const currentSpoke = spokeIds.indexOf(current.spokeId);
    const nextSpoke = spokeIds[(currentSpoke + delta + spokeIds.length) % spokeIds.length]!;
    const next = this.items.findIndex((item) => item.spokeId === nextSpoke);
    if (next >= 0) this.selectIndex(next, true);
  }

  private confirmSelected(): void {
    const item = this.items[this.selection.confirm().index];
    if (!item) return;
    audio.unlock();
    if (item.state === 'locked') {
      audio.uiTick(200);
      this.showToast(item.rowCopy);
      return;
    }
    audio.uiConfirm();
    this.scene.start('mission', { heroId: this.heroId, levelId: item.levelId });
  }

  private toHeroSelect(): void {
    audio.unlock();
    audio.uiConfirm();
    this.scene.start('hero-select', { heroId: this.heroId });
  }

  private openUpgrades(): void {
    const item = this.items[this.selection.selectedIndex];
    if (!item) return;
    audio.unlock();
    audio.uiConfirm();
    this.scene.start('results', upgradeShopEntry(this.heroId, item.levelId));
  }

  private openSettings(): void {
    audio.unlock();
    audio.uiConfirm();
    this.scene.launch('settings', { returnScene: 'mission-hub' });
    this.scene.pause();
  }

  private showToast(text: string): void {
    this.toastText.setText(text);
    this.time.delayedCall(1400, () => this.toastText.setText(''));
  }

  private bindKeys(): void {
    const kb = this.input.keyboard;
    kb?.on('keydown-DOWN', () => this.move('down'));
    kb?.on('keydown-UP', () => this.move('up'));
    kb?.on('keydown-S', () => this.move('down'));
    kb?.on('keydown-W', () => this.move('up'));
    kb?.on('keydown-RIGHT', () => this.jumpSpoke(1));
    kb?.on('keydown-LEFT', () => this.jumpSpoke(-1));
    kb?.on('keydown-D', () => this.jumpSpoke(1));
    kb?.on('keydown-A', () => this.jumpSpoke(-1));
    kb?.on('keydown-ENTER', () => this.confirmSelected());
    kb?.on('keydown-SPACE', () => this.confirmSelected());
    kb?.on('keydown-H', () => this.toHeroSelect());
    kb?.on('keydown-U', () => this.openUpgrades());
    kb?.on('keydown-O', () => this.openSettings());
    bindFullscreenToggle(this);
    bindPadMenu(this, {
      down: () => this.move('down'),
      up: () => this.move('up'),
      right: () => this.jumpSpoke(1),
      left: () => this.jumpSpoke(-1),
      confirm: () => this.confirmSelected(),
      cancel: () => this.toHeroSelect(),
      alt2: () => this.openUpgrades(),
      menu: () => this.openSettings()
    });
  }
}
