import Phaser from 'phaser';
import { CONTENT, firstClearBonus, LEVELS, MISSION_ORDER } from '../../content';
import {
  bankXp,
  buyUpgrade,
  buyWeapon,
  equipWeapon,
  equippedWeaponId,
  loadProfile,
  markHeroMastery,
  markLevelCleared,
  nextLevelId,
  nextTeaser,
  ownedWeapons,
  recordClearTicks,
  saveProfile,
  upgradeCost,
  upgradeLevel,
  UPGRADES,
  weaponsForHero,
  type ClearTimeResult,
  type Profile
} from '../../meta/save';
import { audio } from '../audio';
import { clearTimeCopy, formatClearTime } from '../clearTimes';
import { continuesSpentCopy } from '../continueCopy';
import { bindFullscreenToggle } from '../fullscreen';
import { bindPadMenu } from '../padMenu';
import { TEX } from '../textures';
import { xpResultCopy } from '../xpCopy';

interface ResultsData {
  victory: boolean;
  gold: number;
  kills: number;
  ticks: number;
  /**
   * XP earned this run (issue #46). The level it bought is *not* passed: the
   * banked profile decides that, because past the cap the run's XP buys gold
   * instead (issue #103) and only `bankXp` knows the split.
   */
  xpEarned: number;
  /** Continues bought this run, and what they cost the bank (issue #99). */
  continuesUsed?: number;
  continueGold?: number;
  /** Hero played this run; kept so replay and hero-select return to it. */
  heroId: string;
  /** Level played this run; kept so replay/next-mission target the right realm. */
  levelId: string;
}

/** Mission results + the between-mission upgrade shop. */
export class ResultsScene extends Phaser.Scene {
  private profile!: Profile;
  private shopText!: Phaser.GameObjects.Text;
  private bankText!: Phaser.GameObjects.Text;
  private shownBank = 0;
  private bankTween: Phaser.Tweens.Tween | null = null;
  private heroId = 'vanguard';

  constructor() {
    super('results');
  }

  create(data: ResultsData): void {
    const { width, height } = this.scale;
    this.heroId = CONTENT.heroes[data.heroId] ? data.heroId : 'vanguard';
    const levelId = LEVELS[data.levelId] ? data.levelId : MISSION_ORDER[0]!;
    const realmName = LEVELS[levelId]?.name ?? 'The Brood Warrens';

    // Bank the run's gold exactly once, on scene entry. A completion-focused
    // first-clear bounty keeps progress predictable even when optional caches
    // are missed; replays instead pursue hero-mastery seals.
    this.profile = loadProfile();
    const wasCleared = this.profile.clearedLevels.includes(levelId);
    const clearBonus = data.victory && !wasCleared ? firstClearBonus(LEVELS[levelId]!) : 0;
    const bankedGold = data.gold + clearBonus;
    this.profile.bank += bankedGold;
    let newMastery = false;
    let clearTime: ClearTimeResult | null = null;
    // XP banks whether or not the run was won — you keep what you fought for.
    // Past the level cap `bankXp` pays it out as gold instead of adding to a
    // total that no longer moves (issue #103), so it can add to the bank here.
    const xpEarned = Math.max(0, data.xpEarned ?? 0);
    const xpResult = bankXp(this.profile, xpEarned);
    const continuesUsed = Math.max(0, data.continuesUsed ?? 0);
    if (data.victory) {
      this.profile.missionsCompleted += 1;
      // Per-realm record (issue #100). Only a won run sets one — a death is not
      // a clear time, however far the player got. A run that bought its way
      // back up is a clear but not a time (issue #99): the wheel is a
      // progression gate, the record is a scoreboard, and only the scoreboard
      // cares how many times you fell.
      clearTime = continuesUsed > 0 ? null : recordClearTicks(this.profile, levelId, data.ticks);
      newMastery = markHeroMastery(this.profile, levelId, this.heroId);
      markLevelCleared(this.profile, levelId); // unlocks the next realm
    }
    saveProfile(this.profile);

    // Next realm to offer on victory (only once it's unlocked, which a clear
    // of this realm guarantees).
    const nextId = data.victory ? nextLevelId(levelId, MISSION_ORDER) : null;
    const nextName = nextId ? LEVELS[nextId]?.name : undefined;
    // Edge of the authored game: instead of going quiet, name what is coming
    // (issue #63). The rule lives in meta so it is unit-tested; this only draws.
    const teaser = data.victory && !nextId ? nextTeaser(this.profile) : undefined;

    // Banner treatment: colored band + glow behind the verdict, title pops in.
    const bannerColor = data.victory ? 0x9fe06a : 0xe0524d;
    this.add.rectangle(width / 2, 90, width, 74, bannerColor, 0.1);
    this.add.rectangle(width / 2, 55, width, 2, bannerColor, 0.45);
    this.add.rectangle(width / 2, 125, width, 2, bannerColor, 0.45);
    this.add
      .image(width / 2, 90, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(bannerColor)
      .setScale(10, 2)
      .setAlpha(0.2);
    const runTime = formatClearTime(data.ticks); // carries its own unit
    const banner = this.add
      .text(width / 2, 90, data.victory ? 'REALM CLEANSED' : 'THE HIVE PREVAILS', {
        fontFamily: 'monospace',
        fontSize: '42px',
        color: data.victory ? '#9fe06a' : '#e0524d',
        stroke: '#120c1a',
        strokeThickness: 5,
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setScale(0.6)
      .setAlpha(0);
    this.tweens.add({ targets: banner, scale: 1, alpha: 1, duration: 350, ease: 'Back.Out' });

    this.add
      .text(width / 2, 138, realmName, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#a89bb8'
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        165,
        `Gold collected: ${data.gold}${clearBonus ? ` + ${clearBonus} first-clear bounty` : ''}    Kills: ${data.kills}    Time: ${runTime}\n` +
          xpResultCopy(xpEarned, xpResult) +
          (data.victory ? `    ${newMastery ? 'NEW ' : ''}HERO MASTERY` : ''),
        { fontFamily: 'monospace', fontSize: '18px', color: '#f4e3b2', align: 'center' }
      )
      .setOrigin(0.5);

    // What standing back up cost, when it happened. Stated plainly, including
    // the record it forfeited, so the trade is visible after the fact.
    const continuesLine = continuesSpentCopy(continuesUsed, Math.max(0, data.continueGold ?? 0));
    if (continuesLine) {
      this.add
        .text(width / 2, 197, continuesLine, {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#ff9a86'
        })
        .setOrigin(0.5);
    }

    // The realm's record. A beaten one is the loudest thing on this screen
    // after the banner — it is the only replay motivation the game offers.
    if (clearTime) {
      const record = this.add
        .text(width / 2, 197, clearTimeCopy(clearTime), {
          fontFamily: 'monospace',
          fontSize: clearTime.improved ? '19px' : '15px',
          color: clearTime.improved ? '#ffd75e' : '#a89bb8',
          fontStyle: clearTime.improved ? 'bold' : 'normal'
        })
        .setOrigin(0.5);
      if (clearTime.improved && !this.profile.reduceMotion) {
        record.setScale(0.7).setAlpha(0);
        this.tweens.add({ targets: record, scale: 1, alpha: 1, duration: 320, delay: 250, ease: 'Back.Out' });
      }
    }

    this.bankText = this.add
      .text(width / 2, 226, '', { fontFamily: 'monospace', fontSize: '18px', color: '#ffd75e' })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 265, '— SPEND YOUR SPOILS —', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#a89bb8'
      })
      .setOrigin(0.5);

    this.shopText = this.add
      .text(width / 2, 355, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#f4e3b2',
        align: 'center',
        lineSpacing: 10
      })
      .setOrigin(0.5);

    if (teaser) {
      // Name the spoke that owns the boss just felled, rather than hardcoding
      // it — a second spoke must not leave this announcing the first.
      const clearedSpoke =
        CONTENT.spokes.find((s) => s.boss === levelId) ?? CONTENT.spokes[CONTENT.spokes.length - 1];
      this.add
        .text(width / 2, height - 132, `${(clearedSpoke?.name ?? 'THE WHEEL').toUpperCase()} IS CLEANSED`, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#ffd75e'
        })
        .setOrigin(0.5);
      this.add
        .text(width / 2, height - 108, `${teaser.name} — ${teaser.tagline}`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#a89bb8',
          align: 'center',
          wordWrap: { width: width - 160 }
        })
        .setOrigin(0.5);
    }

    // The wheel is the way back into the game now (issue #57): "next" returns
    // to the hub with the newly-opened node under the cursor, rather than
    // launching straight into the next realm — so a freshly-unlocked boss node
    // is actually seen to open.
    const nav = nextName
      ? `N — the wheel: ${nextName} awaits      R — replay      H — hero select`
      : 'W — the wheel      R — replay mission      H — hero select';
    this.add
      .text(width / 2, height - 80, nav, {
        fontFamily: 'monospace',
        fontSize: nextName ? '16px' : '18px',
        color: '#64e6ff'
      })
      .setOrigin(0.5);
    this.add
      .text(
        width / 2,
        height - 48,
        `O — settings      Pad: ${
          nextName ? '(A) next realm  (B) the wheel  (X) replay' : '(A) replay  (B) the wheel'
        }  LB/RB/(Y) buy`,
        {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#7a6f92'
        }
      )
      .setOrigin(0.5);

    // Gold count-up: roll the bank from its pre-mission value to the new
    // total, with a few rising coin ticks along the way. A capped hero's XP
    // dividend is gold like any other, so it rolls up with the rest.
    const rolledGold = bankedGold + xpResult.gold;
    this.shownBank = this.profile.bank - rolledGold;
    this.refreshTexts();
    if (rolledGold > 0) {
      const counter = { v: this.shownBank };
      this.bankTween = this.tweens.add({
        targets: counter,
        v: this.profile.bank,
        duration: 900,
        delay: 350,
        ease: 'Quad.Out',
        onUpdate: () => {
          this.shownBank = counter.v;
          this.refreshTexts();
        }
      });
      for (let i = 0; i < 5; i++) {
        this.time.delayedCall(350 + i * 160, () => audio.uiTick(760 + i * 60));
      }
    }

    audio.unlock();

    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => this.tryBuy('vitality'));
    kb.on('keydown-TWO', () => this.tryBuy('might'));
    kb.on('keydown-THREE', () => this.tryBuyWeapon());
    kb.on('keydown-FOUR', () => this.cycleWeapon());
    const openSettings = (): void => {
      audio.uiConfirm();
      this.scene.launch('settings', { returnScene: 'results' });
      this.scene.pause();
    };
    kb.on('keydown-O', openSettings);
    bindFullscreenToggle(this);
    const replay = (): void => {
      audio.uiConfirm();
      this.scene.start('mission', { heroId: this.heroId, levelId });
    };
    const toHeroSelect = (): void => {
      audio.uiConfirm();
      this.scene.start('hero-select', { heroId: this.heroId });
    };
    kb.once('keydown-R', replay);
    kb.once('keydown-H', toHeroSelect);
    // Back to the wheel. `levelId` seeds the cursor so the hub opens on the
    // node just unlocked (or, with nothing left, the realm just finished).
    const toWheel = (focus: string): void => {
      audio.uiConfirm();
      this.scene.start('mission-hub', { heroId: this.heroId, levelId: focus });
    };
    kb.once('keydown-W', () => toWheel(levelId));
    if (nextId) kb.once('keydown-N', () => toWheel(nextId));

    // The shop and its exits on a pad (issue #98). Confirm takes the forward
    // path a player almost always wants — the next realm when one just opened,
    // otherwise a replay of this one — and the shoulders spend gold, keeping
    // the four purchase keys reachable without a cursor this screen never had.
    bindPadMenu(this, {
      confirm: () => (nextId ? toWheel(nextId) : replay()),
      cancel: () => toWheel(levelId),
      alt: replay,
      alt2: () => this.tryBuyWeapon(),
      shoulderLeft: () => this.tryBuy('vitality'),
      shoulderRight: () => this.tryBuy('might'),
      left: () => this.cycleWeapon(),
      right: () => this.cycleWeapon(),
      back: toHeroSelect,
      menu: openSettings
    });
  }

  private tryBuy(upgradeId: string): void {
    if (buyUpgrade(this.profile, upgradeId)) {
      if (!loadProfile().reduceMotion) this.cameras.main.flash(150, 255, 215, 94);
      audio.uiConfirm();
    } else {
      audio.uiTick(220); // low buzz on a failed purchase
    }
    this.bankTween?.stop();
    this.bankTween = null;
    this.shownBank = this.profile.bank; // purchases update instantly
    this.refreshTexts();
  }

  /** The cheapest tier this hero doesn't own yet, or null if fully equipped. */
  private nextWeaponToBuy(): { id: string; name: string; cost: number } | null {
    const owned = new Set(ownedWeapons(this.profile, this.heroId));
    const next = weaponsForHero(this.heroId).find((w) => !owned.has(w.id));
    return next ? { id: next.id, name: next.name, cost: next.cost } : null;
  }

  private tryBuyWeapon(): void {
    const next = this.nextWeaponToBuy();
    if (next && buyWeapon(this.profile, next.id)) {
      if (!loadProfile().reduceMotion) this.cameras.main.flash(150, 100, 230, 255);
      audio.uiConfirm();
    } else {
      audio.uiTick(220);
    }
    this.settleBank();
  }

  /** Cycle the equipped weapon among the owned tiers for this hero. */
  private cycleWeapon(): void {
    const owned = ownedWeapons(this.profile, this.heroId);
    if (owned.length <= 1) {
      audio.uiTick(220);
      return;
    }
    const current = equippedWeaponId(this.profile, this.heroId);
    const idx = owned.indexOf(current);
    const nextId = owned[(idx + 1) % owned.length]!;
    if (equipWeapon(this.profile, nextId)) audio.uiTick(680);
    this.settleBank();
  }

  private settleBank(): void {
    this.bankTween?.stop();
    this.bankTween = null;
    this.shownBank = this.profile.bank;
    this.refreshTexts();
  }

  private refreshTexts(): void {
    this.bankText.setText(`Bank: ${Math.round(this.shownBank)} gold`);
    const lines = Object.values(UPGRADES).map((def, i) => {
      const level = upgradeLevel(this.profile, def.id);
      const cost = upgradeCost(this.profile, def.id);
      const price = cost === null ? 'MAXED' : `${cost}g`;
      return `[${i + 1}] ${def.name}  (rank ${level}/${def.maxLevel})  ${def.description}  — ${price}`;
    });

    // Weapon track for the hero this run was played with.
    const heroName = CONTENT.heroes[this.heroId]?.name ?? this.heroId;
    const equippedId = equippedWeaponId(this.profile, this.heroId);
    const equippedName = CONTENT.weapons[equippedId]?.name ?? '—';
    const next = this.nextWeaponToBuy();
    const buyLine = next
      ? `[3] Buy ${next.name} — ${next.cost}g`
      : '[3] Buy weapon — all owned';
    lines.push('');
    lines.push(`${heroName}'s weapon: ${equippedName}   ${buyLine}   [4] Swap equipped`);

    this.shopText.setText(lines.join('\n'));
  }
}
