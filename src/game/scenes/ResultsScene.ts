import Phaser from 'phaser';
import { CONTENT, LEVELS, MISSION_ORDER, firstClearBonus } from '../../content';
import {
  abilitySpecializationsForHero,
  bankXp,
  buyAbilitySpecialization,
  buyUpgrade,
  buyWeapon,
  equippedWeaponId,
  equipWeapon,
  loadProfile,
  markHeroMastery,
  markLevelCleared,
  nextLevelId,
  nextTeaser,
  ownedWeapons,
  recordClearTicks,
  saveProfile,
  type ClearTimeResult,
  type Profile
} from '../../meta/save';
import { audio } from '../audio';
import { clearTimeCopy, formatClearTime } from '../clearTimes';
import { continuesSpentCopy } from '../continueCopy';
import { FULLSCREEN_HINT, bindFullscreenToggle } from '../fullscreen';
import { MenuSelection, type SelectionPosition } from '../menuSelection';
import { bindPadMenu } from '../padMenu';
import { partyResultLines, partyResultTotals, type PartyResultPlayer } from '../partyResults';
import {
  resultsNavigationActions,
  resultsShopCards,
  specializationCards,
  xpProgressViewModel,
  type ResultsNavigationAction,
  type ShopCard,
  type SpecializationShopCard
} from '../resultsViewModel';
import { TEX } from '../textures';
import { resultsReturnTarget, type MissionHubReturnTarget, type ResultsSceneData, type RunResultsData } from '../upgradeRoute';

/** Results, upgrades, and exits share one visible cursor and one confirm path. */
export class ResultsScene extends Phaser.Scene {
  private profile!: Profile;
  private heroId = 'vanguard';
  private levelId = '';
  private shopOnly = false;
  private shopPadArmed = true;
  private returnTarget!: MissionHubReturnTarget;
  private nextId: string | null = null;
  private nextName: string | undefined;
  private victory = false;
  private players: PartyResultPlayer[] = [];
  private selection!: MenuSelection;
  private mainRows: number[] = [3, 1, 3];
  private mainPosition: SelectionPosition = { row: 0, col: 0 };
  private pendingSpecialization = -1;
  private modalOpen = false;
  private dynamicObjects: Phaser.GameObjects.GameObject[] = [];
  private modalObjects: Phaser.GameObjects.GameObject[] = [];
  private bankText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private navigationActions: ResultsNavigationAction[] = [];
  private activatedNavigationCol: number | null = null;
  private navigationActivating = false;
  private shopCards: ShopCard[] = [];
  private specializationShopCards: SpecializationShopCard[] = [];

  constructor() {
    super('results');
  }

  create(data: ResultsSceneData): void {
    const { width, height } = this.scale;
    this.activatedNavigationCol = null;
    this.navigationActivating = false;
    this.shopOnly = data.mode === 'shop';
    this.shopPadArmed = !this.shopOnly;
    if (this.shopOnly) this.time.delayedCall(200, () => { this.shopPadArmed = true; });
    this.returnTarget = resultsReturnTarget(data);
    this.victory = data.mode === 'run' && data.victory;
    this.players = data.mode === 'run' ? [...data.players].sort((a, b) => a.slot - b.slot) : [];
    this.heroId = CONTENT.heroes[this.players[0]?.heroId ?? data.heroId] ? this.players[0]?.heroId ?? data.heroId : 'vanguard';
    this.levelId = LEVELS[data.levelId] ? data.levelId : MISSION_ORDER[0]!;
    const level = LEVELS[this.levelId]!;

    this.profile = loadProfile();
    this.nextId = null;
    this.nextName = undefined;

    this.drawBackground(width, height);
    if (data.mode === 'run') {
      const totals = partyResultTotals(this.players);
      const wasCleared = this.profile.clearedLevels.includes(this.levelId);
      const clearBonus = data.victory && !wasCleared ? firstClearBonus(level) : 0;
      const bankedGold = totals.gold + clearBonus;
      this.profile.bank += bankedGold;
      const xpResult = bankXp(this.profile, totals.xp);
      const continuesUsed = Math.max(0, data.continuesUsed ?? 0);
      let newMastery = false;
      let clearTime: ClearTimeResult | null = null;
      if (data.victory) {
        this.profile.missionsCompleted += 1;
        clearTime = continuesUsed > 0 ? null : recordClearTicks(this.profile, this.levelId, data.ticks);
        for (const heroId of new Set(this.players.map((player) => player.heroId))) {
          newMastery = markHeroMastery(this.profile, this.levelId, heroId) || newMastery;
        }
        markLevelCleared(this.profile, this.levelId);
      }
      saveProfile(this.profile);

      this.nextId = data.victory ? nextLevelId(this.levelId, MISSION_ORDER) : null;
      this.nextName = this.nextId ? LEVELS[this.nextId]?.name : undefined;
      const teaser = data.victory && !this.nextId ? nextTeaser(this.profile) : undefined;

      this.drawBanner(width, level.name, data.victory, newMastery);
      this.drawStatTiles(totals, bankedGold, clearBonus, xpResult, data.ticks, clearTime, data.victory);
      this.drawRunNotes(width, data, clearTime, teaser);
    } else {
      this.drawShopBanner(width, level.name);
    }
    this.navigationActions = resultsNavigationActions(this.nextName);

    this.mainRows = [3, Math.max(1, abilitySpecializationsForHero(this.heroId).length), 3];
    this.selection = new MenuSelection(this.mainRows, { row: 0, col: 0 });

    this.toastText = this.add
      .text(width / 2, height - 11, '', { fontFamily: 'monospace', fontSize: '11px', color: '#64e6ff', align: 'center' })
      .setOrigin(0.5)
      .setDepth(30);
    this.renderDynamic();
    this.bindKeys();
    audio.unlock();

    const resultsDebugHandle = {
      getState: () => ({
        selectedRow: this.selection.position.row,
        selectedCol: this.selection.position.col,
        selectedIndex: this.selection.selectedIndex,
        modalOpen: this.modalOpen,
        mode: this.shopOnly ? 'shop' : 'run',
        heroId: this.heroId,
        levelId: this.levelId,
        bank: this.profile.bank,
        dynamicObjectCount: this.dynamicObjects.length,
        scenePaused: this.scene.isPaused(),
        navigationActions: this.navigationActions.map((action, col) => ({
          ...action,
          state: this.activatedNavigationCol === col
            ? 'activated'
            : this.selection.position.row === 2 && this.selection.position.col === col
              ? 'focused'
              : 'default'
        })),
        chosenSpecialization: this.profile.abilitySpecializations[abilitySpecializationsForHero(this.heroId)[0]?.groupId ?? ''] ?? null
      })
    };
    (globalThis as Record<string, unknown>).__hiveResults = resultsDebugHandle;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if ((globalThis as Record<string, unknown>).__hiveResults === resultsDebugHandle) delete (globalThis as Record<string, unknown>).__hiveResults;
    });
  }

  private drawBackground(width: number, height: number): void {
    this.cameras.main.setBackgroundColor('#080811');
    this.add.rectangle(width / 2, height / 2, width, height, 0x080811, 1);
    this.add.tileSprite(width / 2, height / 2, width, height, TEX.floor).setAlpha(0.11).setTint(0x4b3560);
    this.add.rectangle(width / 2, height / 2, width - 2, height - 2, 0x080811, 0).setStrokeStyle(1, 0xa855c8, 0.28);
  }

  private drawBanner(width: number, realmName: string, victory: boolean, newMastery: boolean): void {
    const color = victory ? 0x9fe06a : 0xe0524d;
    this.add.rectangle(width / 2, 45, width - 60, 2, color, 0.45);
    this.add
      .text(width / 2, 45, victory ? 'REALM CLEANSED' : 'THE HIVE PREVAILS', {
        fontFamily: 'sans-serif',
        fontSize: '34px',
        color: victory ? '#9fe06a' : '#e0524d',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 80, `${realmName.toUpperCase()}  ·  ${CONTENT.heroes[this.heroId]?.name.toUpperCase() ?? this.heroId.toUpperCase()}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#a194b3'
      })
      .setOrigin(0.5);
    if (newMastery) {
      this.add
        .text(width - 30, 45, 'NEW HERO MASTERY', { fontFamily: 'monospace', fontSize: '10px', color: '#ffd75e' })
        .setOrigin(1, 0.5);
    }
  }

  private drawShopBanner(width: number, levelName: string): void {
    this.add.rectangle(width / 2, 45, width - 60, 2, 0x64e6ff, 0.45);
    this.add
      .text(width / 2, 45, 'HIVE ARMORY', {
        fontFamily: 'sans-serif',
        fontSize: '34px',
        color: '#64e6ff',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 80, `${CONTENT.heroes[this.heroId]?.name.toUpperCase() ?? this.heroId.toUpperCase()}  ·  UPGRADES & LOADOUT`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#a194b3'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 160, `PREPARING FOR ${levelName.toUpperCase()}  ·  NO RUN REWARDS CLAIMED`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#9fe06a',
        backgroundColor: '#151d18',
        padding: { left: 14, right: 14, top: 9, bottom: 9 }
      })
      .setOrigin(0.5);
  }

  private drawStatTiles(
    totals: ReturnType<typeof partyResultTotals>,
    bankedGold: number,
    clearBonus: number,
    xpResult: ReturnType<typeof bankXp>,
    ticks: number,
    clearTime: ClearTimeResult | null,
    victory: boolean
  ): void {
    const xPositions = [31, 259, 487, 715];
    const xpProgress = xpProgressViewModel(this.profile);
    const labels = ['GOLD EARNED', 'ENEMIES FELLED', 'CLEAR TIME', xpProgress.label];
    const values = [String(bankedGold), String(totals.kills), formatClearTime(ticks), `${xpProgress.percent}%`];
    const icons = ['◆', '✹', '◷', 'III'];
    const sublabels = [clearBonus ? `+${clearBonus} FIRST CLEAR` : victory ? 'REPLAY SPOILS' : 'RUN SPOILS', 'TOTAL RUN KILLS', clearTime ? clearTimeCopy(clearTime) : 'NO RECORD SET', xpResult.atCap ? 'VETERAN DIVIDEND ACTIVE' : 'PROGRESS TO NEXT LEVEL'];
    xPositions.forEach((x, index) => {
      this.add.rectangle(x, 115, 218, 100, 0x1a1526, 0.95).setOrigin(0, 0).setStrokeStyle(1, 0x544868, 0.85);
      this.add.text(x + 14, 135, icons[index]!, { fontFamily: 'sans-serif', fontSize: '21px', color: index === 1 ? '#c0b3ce' : '#ffd75e', fontStyle: 'bold' }).setOrigin(0, 0.5);
      this.add.text(x + 52, 133, labels[index]!, { fontFamily: 'monospace', fontSize: '10px', color: '#a194b3' }).setOrigin(0, 0.5);
      this.add.text(x + 52, 163, values[index]!, { fontFamily: 'sans-serif', fontSize: '24px', color: index === 0 ? '#ffd75e' : '#f4e3b2', fontStyle: 'bold' }).setOrigin(0, 0.5);
      this.add.text(x + 52, 193, sublabels[index]!, { fontFamily: 'monospace', fontSize: '9px', color: index === 2 && clearTime?.improved ? '#ffd75e' : '#9fe06a', wordWrap: { width: 148 } }).setOrigin(0, 0.5);
      if (index === 3) {
        this.add.rectangle(x + 52, 201, 151, 5, 0x3a3442, 0.9).setOrigin(0, 0.5);
        this.add.rectangle(x + 52, 201, 151 * xpProgress.percent / 100, 5, 0x64e6ff, 1).setOrigin(0, 0.5);
      }
    });
  }

  private drawRunNotes(width: number, data: RunResultsData, clearTime: ClearTimeResult | null, teaser: ReturnType<typeof nextTeaser>): void {
    const notes: string[] = [];
    const continues = continuesSpentCopy(Math.max(0, data.continuesUsed ?? 0), Math.max(0, data.continueGold ?? 0));
    if (continues) notes.push(continues);
    if (this.players.length > 1) notes.push(...partyResultLines(this.players));
    if (teaser) notes.push(`${teaser.name.toUpperCase()}  ·  ${teaser.tagline}`);
    this.add.text(width / 2, 231, notes.join('     '), { fontFamily: 'monospace', fontSize: '10px', color: '#ff9a86', align: 'center', wordWrap: { width: 900 } }).setOrigin(0.5);
    void clearTime;
  }

  private renderDynamic(): void {
    if (this.modalOpen) return;
    for (const object of this.dynamicObjects) object.destroy();
    this.dynamicObjects = [];
    this.selection.setRows(this.mainRows);
    this.shopCards = resultsShopCards(this.profile, this.heroId);
    this.specializationShopCards = specializationCards(this.profile, this.heroId);
    this.renderBank();
    this.renderShop();
    this.renderSpecializations();
    this.renderNavigation();
  }

  private renderBank(): void {
    this.bankText = this.add
      .text(930, 247, `${Math.round(this.profile.bank)}g  BANKED`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffd75e',
        backgroundColor: '#211b20',
        padding: { left: 12, right: 12, top: 7, bottom: 7 }
      })
      .setOrigin(1, 0.5);
    this.dynamicObjects.push(this.bankText);
    const label = this.add.text(31, 247, 'SPEND YOUR SPOILS', { fontFamily: 'monospace', fontSize: '12px', color: '#a194b3', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.dynamicObjects.push(label);
  }

  private renderShop(): void {
    this.shopCards.forEach((card, col) => {
      const x = 31 + col * 304;
      const background = this.makeTarget(x, 278, 294, 136, 0, col, this.cardState(card), this.cardSelected(0, col));
      this.dynamicObjects.push(background);
      const icon = card.kind === 'upgrade' ? (col === 0 ? '♥' : '✦') : '⇥';
      this.addCardText(x, 278, icon, card.name, card.description, this.cardBadge(card), this.rankPips(card));
    });
  }

  private renderSpecializations(): void {
    const panel = this.add.rectangle(31, 428, 900, 205, 0x1b1126, 0.94).setOrigin(0, 0).setStrokeStyle(1, 0xa855c8, 0.7);
    this.dynamicObjects.push(panel);
    const heading = this.add.text(48, 449, '◆  ABILITY SPECIALIZATION  ·  PERMANENT CHOICE', { fontFamily: 'monospace', fontSize: '12px', color: '#efc1f8', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.dynamicObjects.push(heading);
    if (this.specializationShopCards.length === 0) {
      const empty = this.add.text(48, 525, 'No specialization branches are authored for this hero.', { fontFamily: 'monospace', fontSize: '12px', color: '#a194b3' }).setOrigin(0, 0.5);
      this.dynamicObjects.push(empty);
      return;
    }
    const note = this.add.text(913, 449, this.specializationShopCards.some((card) => card.status === 'chosen') ? 'CHOSEN BRANCH · ALTERNATE CLOSED' : 'PREVIEW BOTH SHAPES BEFORE CHOOSING', { fontFamily: 'monospace', fontSize: '9px', color: '#a194b3' }).setOrigin(1, 0.5);
    this.dynamicObjects.push(note);
    this.specializationShopCards.forEach((card, col) => {
      const x = 44 + col * 442;
      const background = this.makeTarget(x, 470, 432, 149, 1, col, this.cardState(card), this.cardSelected(1, col));
      this.dynamicObjects.push(background);
      const viz = this.add.rectangle(x + 326, 484, 106, 88, 0x100b18, 0.95).setOrigin(0, 0).setStrokeStyle(1, 0xa855c8, 0.45);
      this.dynamicObjects.push(viz);
      const vizMark = card.abilityKind === 'blast' && card.name.includes('Faultline')
        ? this.add.text(x + 344, 528, '●━━━━▶', { fontFamily: 'monospace', fontSize: '16px', color: '#ffd75e' }).setOrigin(0.5)
        : this.add.text(x + 379, 528, '◎', { fontFamily: 'sans-serif', fontSize: '36px', color: '#a855c8' }).setOrigin(0.5);
      this.dynamicObjects.push(vizMark);
      this.addCardText(x, 470, '◆', card.name, card.description, this.specializationBadge(card), '');
      const detail = this.add.text(x + 14, 568, card.detail, { fontFamily: 'monospace', fontSize: '10px', color: '#a194b3', wordWrap: { width: 290 } }).setOrigin(0, 0.5);
      this.dynamicObjects.push(detail);
    });
  }

  private renderNavigation(): void {
    const widths = [390, 230, 264] as const;
    let x = 31;
    this.navigationActions.forEach((action, col) => {
      const width = widths[col] ?? 230;
      const focused = this.cardSelected(2, col);
      const activated = this.activatedNavigationCol === col;
      const fill = activated ? 0xffd75e : focused ? 0x17303a : 0x100b18;
      const stroke = activated ? 0xf4e3b2 : focused ? 0x64e6ff : col === 0 ? 0xffd75e : 0x716280;
      const titleColor = activated ? '#100b18' : focused ? '#64e6ff' : col === 0 ? '#ffd75e' : '#f4e3b2';
      const detailColor = activated ? '#21182e' : focused ? '#d9f8ff' : '#a194b3';
      const hint = activated ? 'CONFIRMED' : focused ? 'ENTER · A' : action.shortcut;
      const background = this.add
        .rectangle(x, 646, width, 57, fill, activated ? 1 : 0.96)
        .setOrigin(0, 0)
        .setStrokeStyle(focused || activated ? 2 : 1, stroke, focused || activated ? 1 : 0.78)
        .setInteractive({ useHandCursor: true });
      background.on('pointerover', () => this.pointerSelect(2, col));
      background.on('pointerdown', () => {
        if (this.navigationActivating) return;
        this.selection.pointer({ row: 2, col });
        this.activateNavigation(col);
      });

      const glyph = this.add
        .text(x + 15, 664, focused ? '▶' : action.glyph, { fontFamily: 'monospace', fontSize: '13px', color: titleColor, fontStyle: 'bold' })
        .setOrigin(0, 0.5);
      const title = this.add
        .text(x + 39, 664, action.label, { fontFamily: 'monospace', fontSize: '12px', color: titleColor, fontStyle: 'bold' })
        .setOrigin(0, 0.5);
      const detail = this.add
        .text(x + 39, 686, activated ? this.navigationActivationCopy(action) : action.detail, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: detailColor
        })
        .setOrigin(0, 0.5);
      const keyHint = this.add
        .text(x + width - 12, 664, hint, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: activated ? '#100b18' : focused ? '#100b18' : '#c0b3ce',
          backgroundColor: activated ? '#f4e3b2' : focused ? '#64e6ff' : '#21182e',
          padding: { left: 6, right: 6, top: 3, bottom: 3 }
        })
        .setOrigin(1, 0.5);
      this.dynamicObjects.push(background, glyph, title, detail, keyHint);
      x += width + 8;
    });

    const fullscreen = this.add
      .text(930, 636, FULLSCREEN_HINT, { fontFamily: 'monospace', fontSize: '9px', color: '#716280' })
      .setOrigin(1, 0.5);
    this.dynamicObjects.push(fullscreen);
  }

  private navigationActivationCopy(action: ResultsNavigationAction): string {
    if (action.id === 'mission-select') return 'OPENING MISSION SELECT…';
    if (action.id === 'replay') return 'RESTARTING MISSION…';
    return 'OPENING HERO SELECT…';
  }

  private makeTarget(x: number, y: number, width: number, height: number, row: number, col: number, state: string, selected: boolean): Phaser.GameObjects.Rectangle {
    const color = selected ? 0x64e6ff : state === 'chosen' ? 0x9fe06a : state === 'closed' ? 0x7d6b85 : 0x544868;
    const fill = state === 'unaffordable' || state === 'closed' || state === 'maxed' ? 0x14101d : 0x1a1526;
    const background = this.add.rectangle(x, y, width, height, fill, 0.96).setOrigin(0, 0).setStrokeStyle(selected ? 2 : 1, color, selected ? 1 : 0.8);
    background.setInteractive({ useHandCursor: true });
    background.on('pointerover', () => this.pointerSelect(row, col));
    background.on('pointerdown', () => this.activateSelected());
    return background;
  }

  private addCardText(x: number, y: number, icon: string, name: string, description: string, badge: string, rank: string): void {
    const iconText = this.add.text(x + 14, y + 28, icon, { fontFamily: 'sans-serif', fontSize: '19px', color: '#ffd75e', fontStyle: 'bold' }).setOrigin(0, 0.5);
    const nameText = this.add.text(x + 57, y + 27, name, { fontFamily: 'sans-serif', fontSize: '15px', color: '#f0e8f5', fontStyle: 'bold' }).setOrigin(0, 0.5);
    const descriptionText = this.add.text(x + 57, y + 58, description, { fontFamily: 'monospace', fontSize: '10px', color: '#c0b3ce', wordWrap: { width: 225 } }).setOrigin(0, 0);
    const rankText = this.add.text(x + 14, y + 111, rank, { fontFamily: 'monospace', fontSize: '12px', color: '#ffd75e' }).setOrigin(0, 0.5);
    const badgeText = this.add.text(x + 278, y + 111, badge, { fontFamily: 'monospace', fontSize: '10px', color: badge.startsWith('BUY') || badge.startsWith('PREVIEW') ? '#ffd75e' : '#a194b3', backgroundColor: '#2a2232', padding: { left: 6, right: 6, top: 4, bottom: 4 } }).setOrigin(1, 0.5);
    this.dynamicObjects.push(iconText, nameText, descriptionText, rankText, badgeText);
  }

  private rankPips(card: ShopCard): string {
    if (card.kind === 'upgrade') return `${'■'.repeat(card.rank)}${'□'.repeat(Math.max(0, card.maxRank - card.rank))}`;
    return `${'■'.repeat(card.ownedCount)}${'□'.repeat(Math.max(0, card.totalCount - card.ownedCount))}`;
  }

  private cardState(card: ShopCard | SpecializationShopCard): string {
    if ('kind' in card) return card.status;
    return card.status === 'closed' ? 'closed' : card.status;
  }

  private cardBadge(card: ShopCard): string {
    if (card.kind === 'upgrade') {
      if (card.status === 'maxed') return 'MAXED';
      if (card.status === 'unaffordable') return `SHORT ${Math.max(0, (card.cost ?? 0) - this.profile.bank)}g`;
      return `BUY ${card.cost}g`;
    }
    if (card.nextPurchase) {
      if (card.status === 'unaffordable') return `SHORT ${Math.max(0, (card.cost ?? 0) - this.profile.bank)}g`;
      return `BUY ${card.cost}g`;
    }
    return 'CYCLE EQUIPPED';
  }

  private specializationBadge(card: SpecializationShopCard): string {
    if (card.status === 'chosen') return 'CHOSEN';
    if (card.status === 'closed') return 'BRANCH CLOSED';
    if (card.status === 'unaffordable') return `SHORT ${Math.max(0, card.cost - this.profile.bank)}g`;
    return `PREVIEW · ${card.cost}g`;
  }

  private cardSelected(row: number, col: number): boolean {
    const position = this.selection.position;
    return !this.modalOpen && position.row === row && position.col === col;
  }

  private pointerSelect(row: number, col: number): void {
    if (this.modalOpen || this.navigationActivating) return;
    if (this.selection.position.row === row && this.selection.position.col === col) return;
    this.selection.pointer({ row, col });
    audio.uiTick();
    this.renderDynamic();
  }

  private activateSelected(intent: 'default' | 'cycle' | 'wheel' = 'default'): void {
    if (this.navigationActivating) return;
    if (this.modalOpen) {
      if (this.selection.position.col === 0) this.confirmSpecialization();
      else this.cancelSpecialization();
      return;
    }
    const target = this.selection.confirm();
    if (target.row === 0) this.activateShop(target.col, intent === 'cycle' ? 'cycle' : 'default');
    else if (target.row === 1) this.activateSpecialization(target.col);
    else this.activateNavigation(target.col, intent === 'wheel' ? 'wheel' : 'default');
  }

  private activateShop(col: number, intent: 'default' | 'cycle'): void {
    const card = this.shopCards[col];
    if (!card) return;
    let changed = false;
    if (card.kind === 'upgrade') {
      changed = buyUpgrade(this.profile, card.id);
      if (changed) audio.uiConfirm();
      else audio.uiTick(220);
      this.showToast(changed ? `${card.name} upgraded` : `${card.name} cannot be purchased`);
    } else if (card.nextPurchase && intent !== 'cycle') {
      changed = buyWeapon(this.profile, card.id);
      if (changed) audio.uiConfirm();
      else audio.uiTick(220);
      this.showToast(changed ? `${card.name} equipped` : `${card.name} cannot be purchased`);
    } else {
      changed = this.cycleWeapon();
      this.showToast(changed ? 'Equipped weapon cycled' : 'No alternate owned weapon');
    }
    void changed;
    this.renderDynamic();
  }

  private cycleWeapon(): boolean {
    const owned = ownedWeapons(this.profile, this.heroId);
    if (owned.length <= 1) return false;
    const current = equippedWeaponId(this.profile, this.heroId);
    const index = owned.indexOf(current);
    const next = owned[(index + 1) % owned.length]!;
    const changed = equipWeapon(this.profile, next);
    if (changed) audio.uiConfirm();
    return changed;
  }

  private activateSpecialization(index: number): void {
    const card = this.specializationShopCards[index];
    if (!card) return;
    if (card.status === 'available') {
      this.openSpecialization(index);
    } else {
      audio.uiTick(220);
      this.showToast(card.status === 'chosen' ? `${card.name} is equipped` : card.status === 'closed' ? 'The other specialization is permanent' : `Need ${Math.max(0, card.cost - this.profile.bank)}g more`);
      this.renderDynamic();
    }
  }

  private openSpecialization(index: number): void {
    this.pendingSpecialization = index;
    this.mainPosition = this.selection.position;
    this.modalOpen = true;
    this.selection.setRows([2], false);
    this.selection.select({ row: 0, col: 1 });
    this.renderModal();
  }

  private renderModal(): void {
    for (const object of this.modalObjects) object.destroy();
    this.modalObjects = [];
    const card = this.specializationShopCards[this.pendingSpecialization];
    const other = this.specializationShopCards[1 - this.pendingSpecialization];
    if (!card || !other) return;
    const shade = this.add.rectangle(0, 0, 960, 720, 0x050309, 0.88).setOrigin(0, 0).setDepth(100).setInteractive();
    shade.on('pointerdown', () => undefined);
    this.modalObjects.push(shade);
    const panel = this.add.rectangle(225, 211, 510, 294, 0x21182e, 0.99).setOrigin(0, 0).setStrokeStyle(1, 0xffd75e, 0.7).setDepth(101);
    this.modalObjects.push(panel);
    const title = this.add.text(249, 245, `CHOOSE ${card.name.toUpperCase()}?`, { fontFamily: 'sans-serif', fontSize: '21px', color: '#f4e3b2', fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(102);
    const body = this.add.text(249, 282, `${card.detail} This choice costs ${card.cost}g and applies to this hero on every future run.`, { fontFamily: 'monospace', fontSize: '12px', color: '#c0b3ce', wordWrap: { width: 330 }, lineSpacing: 5 }).setOrigin(0, 0).setDepth(102);
    const viz = this.add.rectangle(600, 239, 110, 78, 0x100b18, 0.95).setOrigin(0, 0).setStrokeStyle(1, 0xa855c8, 0.45).setDepth(102);
    const vizMark = card.name.includes('Faultline')
      ? this.add.text(655, 278, '●━━━━▶', { fontFamily: 'monospace', fontSize: '14px', color: '#ffd75e' }).setOrigin(0.5).setDepth(103)
      : this.add.text(655, 278, '◎', { fontFamily: 'sans-serif', fontSize: '34px', color: '#a855c8' }).setOrigin(0.5).setDepth(103);
    const warning = this.add.text(249, 388, `${other.name} WILL CLOSE PERMANENTLY. THIS CANNOT BE UNDONE.`, { fontFamily: 'monospace', fontSize: '10px', color: '#f0b5b1', backgroundColor: '#35171f', padding: { left: 9, right: 9, top: 8, bottom: 8 }, wordWrap: { width: 430 } }).setOrigin(0, 0).setDepth(102);
    this.modalObjects.push(title, body, viz, vizMark, warning);
    const confirm = this.makeModalTarget(249, 442, 253, 40, 0, `CONFIRM  ·  ${card.cost}g`, this.selection.position.col === 0);
    const cancel = this.makeModalTarget(512, 442, 100, 40, 1, 'CANCEL', this.selection.position.col === 1);
    this.modalObjects.push(confirm, cancel);
  }

  private makeModalTarget(x: number, y: number, width: number, height: number, col: number, label: string, selected: boolean): Phaser.GameObjects.Rectangle {
    const background = this.add.rectangle(x, y, width, height, selected ? 0xffd75e : 0x100b18, selected ? 1 : 0.95).setOrigin(0, 0).setStrokeStyle(2, selected ? 0x64e6ff : 0xc0b3ce, selected ? 1 : 0.7).setDepth(102);
    background.setInteractive({ useHandCursor: true });
    background.on('pointerover', () => {
      if (this.selection.position.col === col) return;
      this.selection.pointer({ row: 0, col });
      this.renderModal();
    });
    background.on('pointerdown', () => this.activateSelected());
    const text = this.add.text(x + width / 2, y + height / 2, label, { fontFamily: 'monospace', fontSize: '10px', color: selected ? '#17131f' : '#c0b3ce', fontStyle: 'bold' }).setOrigin(0.5).setDepth(103);
    this.modalObjects.push(text);
    return background;
  }

  private confirmSpecialization(): void {
    const card = this.specializationShopCards[this.pendingSpecialization];
    if (!card) return;
    const def = abilitySpecializationsForHero(this.heroId).find((candidate) => candidate.id === card.id);
    const changed = def ? buyAbilitySpecialization(this.profile, def.id) : false;
    audio[changed ? 'uiConfirm' : 'uiTick'](changed ? 680 : 220);
    this.closeModal();
    this.showToast(changed ? `${card.name} chosen permanently` : `${card.name} could not be purchased`);
  }

  private cancelSpecialization(): void {
    this.closeModal();
    this.showToast('Specialization purchase cancelled');
  }

  private closeModal(): void {
    this.modalOpen = false;
    this.pendingSpecialization = -1;
    for (const object of this.modalObjects) object.destroy();
    this.modalObjects = [];
    this.selection.setRows(this.mainRows, false);
    this.selection.select(this.mainPosition);
    this.renderDynamic();
  }

  private activateNavigation(col: number, intent: 'default' | 'wheel' = 'default'): void {
    const action = this.navigationActions[col];
    if (!action || this.modalOpen || this.navigationActivating) return;
    this.selection.select({ row: 2, col });
    this.activatedNavigationCol = col;
    this.navigationActivating = true;
    audio.uiConfirm();
    this.renderDynamic();
    this.time.delayedCall(140, () => {
      if (action.id === 'mission-select') {
        if (this.shopOnly) {
          this.scene.start(this.returnTarget.scene, {
            heroId: this.returnTarget.heroId,
            levelId: this.returnTarget.levelId
          });
        } else {
          const focus = intent === 'wheel' || !this.nextId ? this.levelId : this.nextId;
          this.scene.start('mission-hub', { heroId: this.heroId, levelId: focus });
        }
      } else if (action.id === 'replay') {
        this.scene.start('mission', { heroId: this.heroId, levelId: this.levelId });
      } else {
        this.scene.start('hero-select', { heroId: this.heroId });
      }
    });
  }

  private selectAndActivate(row: number, col: number, intent: 'default' | 'cycle' | 'wheel' = 'default'): void {
    if (this.modalOpen || this.navigationActivating) return;
    this.selection.select({ row, col });
    this.renderDynamic();
    this.activateSelected(intent);
  }

  private move(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (this.navigationActivating) return;
    if (this.modalOpen) {
      if (direction === 'left' || direction === 'right' || direction === 'up' || direction === 'down') this.selection.select({ row: 0, col: this.selection.position.col === 0 ? 1 : 0 });
      this.renderModal();
      return;
    }
    this.selection.move(direction);
    audio.uiTick(direction === 'down' || direction === 'right' ? 620 : 520);
    this.renderDynamic();
  }

  private toWheel(focus: string): void {
    if (this.modalOpen || this.navigationActivating) return;
    audio.uiConfirm();
    const target = this.shopOnly ? this.returnTarget : { scene: 'mission-hub' as const, heroId: this.heroId, levelId: focus };
    this.scene.start(target.scene, { heroId: target.heroId, levelId: target.levelId });
  }

  private replay(): void {
    if (this.modalOpen || this.navigationActivating) return;
    audio.uiConfirm();
    this.scene.start('mission', { heroId: this.heroId, levelId: this.levelId });
  }

  private toHeroSelect(): void {
    if (this.modalOpen || this.navigationActivating) return;
    audio.uiConfirm();
    this.scene.start('hero-select', { heroId: this.heroId });
  }

  private openSettings(): void {
    if (this.modalOpen || this.navigationActivating) return;
    audio.uiConfirm();
    this.scene.launch('settings', { returnScene: 'results' });
    this.scene.pause();
  }

  private showToast(text: string): void {
    this.toastText.setText(text);
    this.time.delayedCall(1400, () => this.toastText.setText(''));
  }

  private bindKeys(): void {
    const kb = this.input.keyboard;
    kb?.on('keydown-UP', () => this.move('up'));
    kb?.on('keydown-DOWN', () => this.move('down'));
    kb?.on('keydown-LEFT', () => this.move('left'));
    kb?.on('keydown-RIGHT', () => this.move('right'));
    kb?.on('keydown-ENTER', () => this.activateSelected());
    kb?.on('keydown-SPACE', () => this.activateSelected());
    kb?.on('keydown-ONE', () => this.selectAndActivate(0, 0));
    kb?.on('keydown-TWO', () => this.selectAndActivate(0, 1));
    kb?.on('keydown-THREE', () => this.selectAndActivate(0, 2));
    kb?.on('keydown-FOUR', () => this.selectAndActivate(0, 2, 'cycle'));
    kb?.on('keydown-FIVE', () => this.selectAndActivate(1, 0));
    kb?.on('keydown-SIX', () => this.selectAndActivate(1, 1));
    kb?.on('keydown-N', () => this.selectAndActivate(2, 0));
    kb?.on('keydown-R', () => this.selectAndActivate(2, 1));
    kb?.on('keydown-H', () => this.selectAndActivate(2, 2));
    kb?.on('keydown-W', () => this.selectAndActivate(2, 0, 'wheel'));
    kb?.on('keydown-O', () => this.openSettings());
    kb?.on('keydown-ESC', () => (this.modalOpen ? this.cancelSpecialization() : this.toWheel(this.levelId)));
    bindFullscreenToggle(this, () => !this.modalOpen);
    bindPadMenu(this, {
      up: () => this.move('up'),
      down: () => this.move('down'),
      left: () => this.move('left'),
      right: () => this.move('right'),
      confirm: () => this.activateSelected(),
      cancel: () => (this.modalOpen ? this.cancelSpecialization() : this.toWheel(this.levelId)),
      alt: () => this.replay(),
      // (Y) opened a shop-only Results entry from the hub. Ignore that same
      // physical press if it is still crossing the scene handoff; otherwise it
      // would immediately buy the weapon card that (Y) activates here.
      alt2: () => {
        if (this.shopOnly && !this.shopPadArmed) return;
        this.selectAndActivate(0, 2);
      },
      shoulderLeft: () => this.selectAndActivate(0, 0),
      shoulderRight: () => this.selectAndActivate(0, 1),
      back: () => this.toHeroSelect(),
      menu: () => this.openSettings()
    });
  }
}
