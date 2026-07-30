import Phaser from 'phaser';
import { CONTENT, LEVELS } from '../../content';
import { loadProfile, nodeLockState, spokeProgress, suggestedNode, type Profile } from '../../meta/save';
import { endOfContentCopy, statusCopy } from '../hubCopy';
import { audio } from '../audio';
import { FULLSCREEN_HINT, bindFullscreenToggle } from '../fullscreen';
import { TEX } from '../textures';

/**
 * The mission wheel (issue #56): a hub with one spoke per realm, each running
 * three missions out to a boss. Everything here is drawn from `CONTENT.spokes`
 * and `CONTENT.teaserSpokes` plus the unlock rules in `src/meta/save.ts` — the
 * scene owns no progression logic and no hardcoded wheel shape, so adding a
 * realm is a content change (see docs/PROGRESSION.md).
 *
 * All generated art: circles, lines and the shared glow texture. No new assets.
 */

/**
 * Distance from the hub to each node along a spoke, mission 1 first. Capped so
 * the outermost (boss) node clears the title at the top of the screen.
 */
const NODE_RADII = [92, 140, 188, 250] as const;
/** How far out a teaser's single placeholder node sits. */
const TEASER_RADIUS = 150;

const COLOR = {
  cleared: 0x9fe06a,
  available: 0xffd75e,
  locked: 0x554a68
} as const;

interface WheelNode {
  spokeId: string;
  spokeName: string;
  levelId: string;
  /** -1 for the spoke's boss. */
  index: number;
  isBoss: boolean;
  x: number;
  y: number;
  accent: number;
}

export class MissionHubScene extends Phaser.Scene {
  private profile!: Profile;
  private nodes: WheelNode[] = [];
  private cursor = 0;
  private heroId = 'vanguard';
  private infoName!: Phaser.GameObjects.Text;
  private infoStatus!: Phaser.GameObjects.Text;
  /** Node markers + selection ring, torn down and redrawn on every refresh. */
  private markers: Phaser.GameObjects.Arc[] = [];
  private ring: Phaser.GameObjects.Arc | null = null;

  constructor() {
    super('mission-hub');
  }

  create(data?: { heroId?: string; levelId?: string }): void {
    const { width, height } = this.scale;
    this.profile = loadProfile();
    this.heroId = data?.heroId && CONTENT.heroes[data.heroId] ? data.heroId : 'vanguard';

    this.cameras.main.setBackgroundColor('#0a0a12');
    this.drawAmbient(width, height);

    const cx = width / 2;
    const cy = height / 2 + 10;
    this.nodes = [];
    this.drawTeasers(cx, cy);
    this.drawSpokes(cx, cy);
    this.drawHub(cx, cy);
    this.drawEndOfContent(cx, cy);

    // Park the cursor on whatever the player should play next, so a single
    // confirm always does the obvious thing (and the e2e default holds).
    const suggested = data?.levelId ?? suggestedNode(this.profile).levelId;
    const found = this.nodes.findIndex((n) => n.levelId === suggested);
    this.cursor = found >= 0 ? found : 0;

    this.drawChrome(width, height);
    this.refresh();
    this.bindKeys();
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

  /** Unit vector for a wheel bearing, in degrees clockwise from straight up. */
  private static dir(angleDeg: number): { x: number; y: number } {
    const r = (angleDeg * Math.PI) / 180;
    return { x: Math.sin(r), y: -Math.cos(r) };
  }

  private drawHub(cx: number, cy: number): void {
    this.add.image(cx, cy, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0x4aa3ff).setScale(2.2).setAlpha(0.25);
    this.add.circle(cx, cy, 26, 0x1a1526).setStrokeStyle(2, 0x6f92c9);
    this.add
      .text(cx, cy, 'HIVE', { fontFamily: 'monospace', fontSize: '13px', color: '#a89bb8' })
      .setOrigin(0.5);
  }

  /** Keep the edge-of-content state visible whenever a player revisits. */
  private drawEndOfContent(cx: number, cy: number): void {
    const end = endOfContentCopy(this.profile);
    if (!end) return;
    const d = MissionHubScene.dir(end.teaser.angleDeg);
    this.add
      .text(cx, cy + 160, end.line, { fontFamily: 'monospace', fontSize: '12px', color: '#c9a227' })
      .setOrigin(0.5);
    this.add
      .text(cx + d.x * TEASER_RADIUS, cy + d.y * TEASER_RADIUS + 44, end.teaser.tagline, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#6b6280',
        align: 'center',
        wordWrap: { width: 230 }
      })
      .setOrigin(0.5, 0);
  }

  /** Announced-but-unauthored branches: a stub arm and a dimmed marker. */
  private drawTeasers(cx: number, cy: number): void {
    for (const teaser of CONTENT.teaserSpokes) {
      const d = MissionHubScene.dir(teaser.angleDeg);
      const ex = cx + d.x * TEASER_RADIUS;
      const ey = cy + d.y * TEASER_RADIUS;
      this.add.line(0, 0, cx, cy, ex, ey, teaser.accent, 0.16).setOrigin(0, 0).setLineWidth(2);
      this.add.circle(ex, ey, 15, 0x14101e).setStrokeStyle(1, teaser.accent, 0.4);
      this.add
        .text(ex, ey, '?', { fontFamily: 'monospace', fontSize: '15px', color: '#5b5170' })
        .setOrigin(0.5);
      this.add
        .text(ex, ey + 28, teaser.name, { fontFamily: 'monospace', fontSize: '11px', color: '#4e4661' })
        .setOrigin(0.5);
    }
  }

  private drawSpokes(cx: number, cy: number): void {
    for (const spoke of CONTENT.spokes) {
      const d = MissionHubScene.dir(spoke.angleDeg);
      const last = NODE_RADII[NODE_RADII.length - 1]!;
      this.add
        .line(0, 0, cx, cy, cx + d.x * last, cy + d.y * last, spoke.accent, 0.5)
        .setOrigin(0, 0)
        .setLineWidth(3);

      const levelIds = [...spoke.missions, spoke.boss];
      levelIds.forEach((levelId, i) => {
        const radius = NODE_RADII[Math.min(i, NODE_RADII.length - 1)]!;
        this.nodes.push({
          spokeId: spoke.id,
          spokeName: spoke.name,
          levelId,
          index: i < spoke.missions.length ? i : -1,
          isBoss: i >= spoke.missions.length,
          x: cx + d.x * radius,
          y: cy + d.y * radius,
          accent: spoke.accent
        });
      });

      // Label beside the boss node, offset perpendicular to the arm — placing
      // it further along the arm would run into the title on a vertical spoke.
      // Anchored to the edge nearest the node rather than centred, so a long
      // realm name grows away from the wheel instead of overlapping it.
      const perp = { x: -d.y, y: d.x };
      this.add
        .text(cx + d.x * last + perp.x * 34, cy + d.y * last + perp.y * 34, spoke.name, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#a89bb8'
        })
        .setOrigin(perp.x >= 0 ? 0 : 1, 0.5);
    }
  }

  private drawChrome(width: number, height: number): void {
    this.add
      .text(width / 2, 36, 'THE WHEEL', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#ffd75e',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);

    this.add.rectangle(width / 2, height - 78, width - 120, 62, 0x1a1526, 0.9).setStrokeStyle(1, 0x544868);
    this.infoName = this.add
      .text(width / 2, height - 92, '', { fontFamily: 'monospace', fontSize: '17px', color: '#f4e3b2' })
      .setOrigin(0.5);
    this.infoStatus = this.add
      .text(width / 2, height - 68, '', { fontFamily: 'monospace', fontSize: '13px', color: '#64e6ff' })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height - 24, `↑↓ node   ←→ realm   Enter deploy   H hero select   ${FULLSCREEN_HINT}`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#7a6f92'
      })
      .setOrigin(0.5);
  }

  /** Redraws node markers and the info panel for the current cursor. */
  private refresh(): void {
    for (const m of this.markers) m.destroy();
    this.markers = [];

    this.nodes.forEach((node, i) => {
      const lock = nodeLockState(this.profile, node.levelId);
      const size = node.isBoss ? 22 : 15;
      const fill = lock.state === 'cleared' ? COLOR.cleared : lock.state === 'available' ? COLOR.available : 0x1a1526;
      const stroke = lock.state === 'locked' ? COLOR.locked : node.accent;
      const marker = this.add.circle(node.x, node.y, size, fill, lock.state === 'locked' ? 1 : 0.85);
      marker.setStrokeStyle(node.isBoss ? 3 : 2, stroke, lock.state === 'locked' ? 0.5 : 1);
      this.markers.push(marker);

      if (i === this.cursor) {
        this.ring?.destroy();
        this.ring = this.add.circle(node.x, node.y, size + 8).setStrokeStyle(2, 0xffffff, 0.8);
        this.markers.push(this.ring);
      }
    });

    const node = this.nodes[this.cursor];
    if (!node) return;
    const lock = nodeLockState(this.profile, node.levelId);
    const progress = spokeProgress(this.profile, node.spokeId);
    const label = LEVELS[node.levelId]?.name ?? node.levelId;
    this.infoName.setText(`${node.isBoss ? '☠ ' : ''}${label}`);
    this.infoStatus
      .setText(`${node.spokeName}   ${progress.cleared}/${progress.total} cleared   ${statusCopy(lock)}`)
      .setColor(lock.state === 'locked' ? '#c86a7a' : lock.state === 'cleared' ? '#9fe06a' : '#64e6ff');
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
    // Between spokes: land on the next realm's first mission. Derived from the
    // node list rather than assuming a fixed nodes-per-spoke count, so a realm
    // with a different mission count still navigates correctly.
    const spokeIds = [...new Set(this.nodes.map((n) => n.spokeId))];
    const jump = (delta: number): void => {
      if (spokeIds.length < 2) {
        audio.uiTick(200); // nowhere else to go yet
        return;
      }
      const here = spokeIds.indexOf(this.nodes[this.cursor]!.spokeId);
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
    kb?.on('keydown-M', () => audio.toggleMute());
    kb?.on('keydown-H', () => {
      audio.unlock();
      audio.uiConfirm();
      this.scene.start('hero-select', { heroId: this.heroId });
    });
    kb?.on('keydown-ENTER', () => {
      audio.unlock();
      const node = this.nodes[this.cursor];
      if (!node) return;
      if (nodeLockState(this.profile, node.levelId).state === 'locked') {
        audio.uiTick(200); // locked: low buzz, stay put
        return;
      }
      audio.uiConfirm();
      this.scene.start('mission', { heroId: this.heroId, levelId: node.levelId });
    });
  }
}
