import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { HeroSelectScene } from './game/scenes/HeroSelectScene';
import { HudScene } from './game/scenes/HudScene';
import { MissionHubScene } from './game/scenes/MissionHubScene';
import { MissionScene } from './game/scenes/MissionScene';
import { ResultsScene } from './game/scenes/ResultsScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 720,
  backgroundColor: '#0a0a12',
  pixelArt: true,
  // Flow: boot → hero select → the wheel → mission (HudScene runs alongside)
  // → results, which returns through the wheel.
  scene: [BootScene, HeroSelectScene, MissionHubScene, MissionScene, HudScene, ResultsScene]
});
