import Phaser from 'phaser';

/**
 * Generated programmer-art textures. Everything is drawn once at boot so the
 * game ships with zero binary assets; real art replaces these texture keys
 * later without touching game code.
 */

export const TEX = {
  wall: 'tile-wall',
  floor: 'tile-floor',
  hero: 'hero-vanguard',
  skitterling: 'enemy-skitterling',
  broodNode: 'generator-brood-node',
  gold: 'pickup-gold',
  health: 'pickup-health',
  exit: 'exit-portal'
} as const;

export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  // Wall tile: dark chitin block with a lighter top edge.
  g.clear();
  g.fillStyle(0x2b2036);
  g.fillRect(0, 0, 32, 32);
  g.fillStyle(0x453456);
  g.fillRect(0, 0, 32, 5);
  g.lineStyle(1, 0x120c1a);
  g.strokeRect(0, 0, 32, 32);
  g.generateTexture(TEX.wall, 32, 32);

  // Floor tile: mottled warren dirt.
  g.clear();
  g.fillStyle(0x17131f);
  g.fillRect(0, 0, 32, 32);
  g.fillStyle(0x1d1827);
  g.fillRect(2, 2, 6, 6);
  g.fillRect(20, 12, 7, 7);
  g.fillRect(8, 22, 5, 5);
  g.generateTexture(TEX.floor, 32, 32);

  // Vanguard: steel-blue armored disc with a bright crest, distinct from gold.
  g.clear();
  g.fillStyle(0x5a8fd9);
  g.fillCircle(14, 14, 12);
  g.fillStyle(0x2f5a8c);
  g.fillCircle(14, 14, 7);
  g.fillStyle(0xd9e6f4);
  g.fillCircle(14, 8, 3);
  g.lineStyle(2, 0x14243d);
  g.strokeCircle(14, 14, 12);
  g.generateTexture(TEX.hero, 28, 28);

  // Skitterling: pale hive bug with dark eyes.
  g.clear();
  g.fillStyle(0x9fe06a);
  g.fillCircle(10, 10, 9);
  g.fillStyle(0x5b8f33);
  g.fillCircle(10, 10, 5);
  g.fillStyle(0x1c260f);
  g.fillCircle(7, 7, 2);
  g.fillCircle(13, 7, 2);
  g.generateTexture(TEX.skitterling, 20, 20);

  // Brood Node: pulsing egg mound.
  g.clear();
  g.fillStyle(0x7a3b8f);
  g.fillCircle(22, 22, 20);
  g.fillStyle(0xa855c8);
  g.fillCircle(22, 18, 13);
  g.fillStyle(0xe1a6f0);
  g.fillCircle(22, 15, 6);
  g.lineStyle(2, 0x3d1d49);
  g.strokeCircle(22, 22, 20);
  g.generateTexture(TEX.broodNode, 44, 44);

  // Gold coin.
  g.clear();
  g.fillStyle(0xffd75e);
  g.fillCircle(8, 8, 7);
  g.fillStyle(0xb8922e);
  g.fillCircle(8, 8, 4);
  g.generateTexture(TEX.gold, 16, 16);

  // Health: hearty red morsel.
  g.clear();
  g.fillStyle(0xe0524d);
  g.fillCircle(6, 9, 5);
  g.fillCircle(12, 9, 5);
  g.fillTriangle(2, 11, 16, 11, 9, 17);
  g.generateTexture(TEX.health, 18, 18);

  // Exit portal: glowing ring.
  g.clear();
  g.lineStyle(4, 0x64e6ff);
  g.strokeCircle(24, 24, 18);
  g.lineStyle(2, 0xbdf4ff);
  g.strokeCircle(24, 24, 11);
  g.generateTexture(TEX.exit, 48, 48);

  g.destroy();
}
